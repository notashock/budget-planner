import 'dart:async';
import 'dart:convert';

import 'package:budget_mobile/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Timeouts, retries, error kinds and idempotency keys (upgrade plan 1.5, 1.6).
void main() {
  final api = ApiService();
  late List<http.Request> sent;

  http.Response ok([Object? data]) =>
      http.Response(jsonEncode({'status': 'success', 'data': data ?? <String, dynamic>{}}), 200);
  http.Response fail(int status, {String code = 'ERR', String message = 'nope'}) => http.Response(
        jsonEncode({'status': 'error', 'error': {'code': code, 'message': message}}),
        status,
      );

  /// Answers each request with the next responder; a responder may throw.
  void script(List<FutureOr<http.Response> Function()> responders) {
    var i = 0;
    api.client = MockClient((req) async {
      sent.add(req);
      final r = responders[i < responders.length ? i : responders.length - 1];
      i++;
      return r();
    });
  }

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    sent = [];
    api.updateBaseUrl('http://api.test');
    api.retryDelay = Duration.zero;
    api.requestTimeout = const Duration(seconds: 15);
  });

  group('idempotency keys', () {
    test('every /api/v1 write carries a UUID Idempotency-Key', () async {
      script([ok]);
      await api.createTransaction(2026, 11, {'amount': 100});
      final key = sent.single.headers['Idempotency-Key'];
      expect(key, matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    });

    test('each write gets its own key', () async {
      script([ok]);
      await api.createTransaction(2026, 11, {'amount': 1});
      await api.createTransaction(2026, 11, {'amount': 1});
      expect(sent[0].headers['Idempotency-Key'], isNot(sent[1].headers['Idempotency-Key']));
    });

    test('reads and non-v1 writes carry no key', () async {
      script([ok]);
      await api.getMonths();
      await api.updateSettings({'theme': 'dark'});
      expect(sent.every((r) => !r.headers.containsKey('Idempotency-Key')), isTrue);
    });
  });

  group('retries', () {
    test('a keyed write that times out is resent once with the same key', () async {
      api.requestTimeout = const Duration(milliseconds: 50);
      script([
        () => Future.delayed(const Duration(milliseconds: 200), ok),
        ok,
      ]);
      await api.createTransaction(2026, 11, {'amount': 100});
      expect(sent, hasLength(2));
      expect(sent[1].headers['Idempotency-Key'], sent[0].headers['Idempotency-Key']);
    });

    test('a keyed write that hits a 5xx is resent once with the same key', () async {
      script([() => fail(503), ok]);
      await api.payTransaction('tx1', amount: 5);
      expect(sent, hasLength(2));
      expect(sent[1].headers['Idempotency-Key'], sent[0].headers['Idempotency-Key']);
    });

    test('a 409 IDEMPOTENCY_IN_PROGRESS is retried once with the same key', () async {
      script([() => fail(409, code: 'IDEMPOTENCY_IN_PROGRESS'), ok]);
      await api.createTransaction(2026, 11, {'amount': 100});
      expect(sent, hasLength(2));
      expect(sent[1].headers['Idempotency-Key'], sent[0].headers['Idempotency-Key']);
    });

    test('a GET retries once after going offline, then reports offline', () async {
      script([() => throw http.ClientException('Connection refused')]);
      await expectLater(
        api.getMonths(),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.offline)),
      );
      expect(sent, hasLength(2));
    });

    test('an unkeyed write that times out is not resent', () async {
      api.requestTimeout = const Duration(milliseconds: 50);
      script([() => Future.delayed(const Duration(milliseconds: 200), ok)]);
      await expectLater(
        api.updateSettings({'theme': 'dark'}),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.timeout)),
      );
      expect(sent, hasLength(1));
    });

    test('validation errors are not retried', () async {
      script([() => fail(400, code: 'VALIDATION_ERROR', message: 'Amount is required')]);
      await expectLater(
        api.createTransaction(2026, 11, {}),
        throwsA(isA<ApiException>()
            .having((e) => e.kind, 'kind', ApiErrorKind.rejected)
            .having((e) => e.code, 'code', 'VALIDATION_ERROR')
            .having((e) => e.message, 'message', 'Amount is required')),
      );
      expect(sent, hasLength(1));
    });
  });

  group('error kinds', () {
    test('404 is notFound and 401 is unauthorized, neither retried', () async {
      script([() => fail(404)]);
      await expectLater(
        api.getMonthDetail(2026, 11),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.notFound)),
      );
      script([() => fail(401)]);
      await expectLater(
        api.getMonths(),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.unauthorized)),
      );
      expect(sent, hasLength(2));
    });

    test('a 2xx body that is not JSON is badResponse, not an empty result', () async {
      script([() => http.Response('<html>proxy error</html>', 200)]);
      await expectLater(
        api.getMonthDetail(2026, 11),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.badResponse)),
      );
    });
  });
}
