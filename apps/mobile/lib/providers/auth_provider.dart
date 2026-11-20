import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';

class AuthProvider with ChangeNotifier {
  final ApiService _api = ApiService();

  bool _isLoading = true;
  bool _isAuthenticated = false;
  Map<String, dynamic>? _user;
  Map<String, dynamic>? _settings;
  String? _error;

  bool get isLoading => _isLoading;
  bool get isAuthenticated => _isAuthenticated;
  Map<String, dynamic>? get user => _user;
  Map<String, dynamic>? get settings => _settings;
  String? get error => _error;

  Future<void> init() async {
    _isLoading = true;
    notifyListeners();

    try {
      await _api.init();
      final token = await StorageService.getToken();
      if (token != null && token.isNotEmpty) {
        try {
          final me = await _api.getMe();
          if (me != null && me['user'] != null) {
            _user = me['user'] as Map<String, dynamic>;
            _settings = me['settings'] is Map ? me['settings'] as Map<String, dynamic> : null;
            _isAuthenticated = true;
            await StorageService.setUser(_user);
          } else {
            _isAuthenticated = false;
            await StorageService.setToken(null);
          }
        } on ApiException catch (e) {
          // Offline or a server hiccup is not a sign-out: start with the user
          // last seen here, so saved data and captured entries stay usable
          // (ADR 0071). A rejected token (401) still signs out.
          final known = e.kind == ApiErrorKind.unauthorized ? null : await StorageService.getUser();
          if (known == null) {
            _isAuthenticated = false;
            if (e.kind == ApiErrorKind.unauthorized) await StorageService.setToken(null);
          } else {
            _user = known;
            _isAuthenticated = true;
          }
        }
      } else {
        _isAuthenticated = false;
      }
    } catch (_) {
      _isAuthenticated = false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final res = await _api.login(email, password);
      _user = res['user'] as Map<String, dynamic>;
      await StorageService.setUser(_user);
      _isAuthenticated = true;
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> register(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final res = await _api.register(email, password);
      _user = res['user'] as Map<String, dynamic>;
      await StorageService.setUser(_user);
      _isAuthenticated = true;
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    _isLoading = true;
    notifyListeners();

    try {
      await _api.logout();
    } catch (_) {
      // The token is cleared locally either way (ApiService.logout); an
      // offline or expired session must still sign out.
    } finally {
      _user = null;
      _settings = null;
      _isAuthenticated = false;
      _isLoading = false;
      notifyListeners();
    }
  }

  /// The server rejected the token (401): sign out locally, no server call.
  Future<void> sessionExpired() async {
    if (!_isAuthenticated) return;
    await StorageService.setToken(null);
    _user = null;
    _settings = null;
    _isAuthenticated = false;
    _error = 'Your session expired. Please sign in again.';
    notifyListeners();
  }

  Future<void> updateServerHost(String url) async {
    await StorageService.setBaseUrl(url);
    _api.updateBaseUrl(url);
    await init();
  }
}
