// GENERATED from apps/web/src/components/Icons.jsx, so mobile draws exactly
// the web's icons. web_icons_test.dart fails when the two drift apart.
import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

class WebIconData {
  const WebIconData(this.name, this.body);

  /// The web component's name without "Icon" (PlusIcon -> Plus).
  final String name;

  /// The SVG elements inside the 24 x 24 outline frame.
  final String body;
}

/// One of the web's outline icons: 24 x 24 view box, round caps and joins,
/// stroke in [color] (default: the surrounding icon colour).
class WebIcon extends StatelessWidget {
  const WebIcon(this.icon, {super.key, this.size = 16, this.color, this.strokeWidth = 2, this.semanticLabel});

  final WebIconData icon;
  final double size;
  final Color? color;
  final double strokeWidth;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = color ?? IconTheme.of(context).color ?? const Color(0xFF000000);
    final svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="$strokeWidth" stroke-linecap="round" stroke-linejoin="round">${icon.body}</svg>';
    final picture = SvgPicture.string(svg, width: size, height: size, theme: SvgTheme(currentColor: c));
    return semanticLabel == null ? ExcludeSemantics(child: picture) : Semantics(label: semanticLabel, child: picture);
  }
}

abstract final class WebIcons {
  static const plus = WebIconData('Plus', '<line x1="12" y1="5" x2="12" y2="19" /> <line x1="5" y1="12" x2="19" y2="12" />');
  static const zap = WebIconData('Zap', '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />');
  static const layoutDashboard = WebIconData('LayoutDashboard', '<rect x="3" y="3" width="7" height="9" rx="1" /> <rect x="14" y="3" width="7" height="5" rx="1" /> <rect x="14" y="12" width="7" height="9" rx="1" /> <rect x="3" y="16" width="7" height="5" rx="1" />');
  static const listOrdered = WebIconData('ListOrdered', '<line x1="10" y1="6" x2="21" y2="6" /> <line x1="10" y1="12" x2="21" y2="12" /> <line x1="10" y1="18" x2="21" y2="18" /> <circle cx="5" cy="6" r="1.5" fill="currentColor" /> <circle cx="5" cy="12" r="1.5" fill="currentColor" /> <circle cx="5" cy="18" r="1.5" fill="currentColor" />');
  static const target = WebIconData('Target', '<circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="6" /> <circle cx="12" cy="12" r="2" fill="currentColor" />');
  static const sparkles = WebIconData('Sparkles', '<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />');
  static const refresh = WebIconData('Refresh', '<polyline points="23 4 23 10 17 10" /> <polyline points="1 20 1 14 7 14" /> <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />');
  static const alertTriangle = WebIconData('AlertTriangle', '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /> <line x1="12" y1="9" x2="12" y2="13" /> <line x1="12" y1="17" x2="12.01" y2="17" />');
  static const checkCircle = WebIconData('CheckCircle', '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /> <polyline points="22 4 12 14.01 9 11.01" />');
  static const mapPin = WebIconData('MapPin', '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /> <circle cx="12" cy="10" r="3" />');
  static const sun = WebIconData('Sun', '<circle cx="12" cy="12" r="5" /> <line x1="12" y1="1" x2="12" y2="3" /> <line x1="12" y1="21" x2="12" y2="23" /> <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /> <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /> <line x1="1" y1="12" x2="3" y2="12" /> <line x1="21" y1="12" x2="23" y2="12" /> <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /> <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />');
  static const moon = WebIconData('Moon', '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />');
  static const trash = WebIconData('Trash', '<polyline points="3 6 5 6 21 6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />');
  static const calendar = WebIconData('Calendar', '<rect x="3" y="4" width="18" height="18" rx="2" ry="2" /> <line x1="16" y1="2" x2="16" y2="6" /> <line x1="8" y1="2" x2="8" y2="6" /> <line x1="3" y1="10" x2="21" y2="10" />');
  static const arrowRight = WebIconData('ArrowRight', '<line x1="5" y1="12" x2="19" y2="12" /> <polyline points="12 5 19 12 12 19" />');
  static const fuel = WebIconData('Fuel', '<path d="M3 22h12M4 9h10M4 4h10a2 2 0 0 1 2 2v16H4V4zM18 7l2 2v7a2 2 0 0 1-2 2" />');
  static const tag = WebIconData('Tag', '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /> <line x1="7" y1="7" x2="7.01" y2="7" />');
  static const logOut = WebIconData('LogOut', '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /> <polyline points="16 17 21 12 16 7" /> <line x1="21" y1="12" x2="9" y2="12" />');
  static const buildingLibrary = WebIconData('BuildingLibrary', '<path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 3l9 5H3l9-5z" />');
  static const wallet = WebIconData('Wallet', '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5" /> <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />');
  static const creditCard = WebIconData('CreditCard', '<rect x="2" y="5" width="20" height="14" rx="2" /> <path d="M2 10h20M6 15h4" />');
  static const arrowRightLeft = WebIconData('ArrowRightLeft', '<path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />');
  static const edit = WebIconData('Edit', '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /> <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />');
  static const shieldAlert = WebIconData('ShieldAlert', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> <line x1="12" y1="8" x2="12" y2="12" /> <line x1="12" y1="16" x2="12.01" y2="16" />');
  static const trendingUp = WebIconData('TrendingUp', '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /> <polyline points="17 6 23 6 23 12" />');
  static const lock = WebIconData('Lock', '<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" />');
  static const user = WebIconData('User', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /> <circle cx="12" cy="7" r="4" />');
  static const monitor = WebIconData('Monitor', '<rect x="2" y="3" width="20" height="14" rx="2" ry="2" /> <line x1="8" y1="21" x2="16" y2="21" /> <line x1="12" y1="17" x2="12" y2="21" />');
  static const x = WebIconData('X', '<line x1="18" y1="6" x2="6" y2="18" /> <line x1="6" y1="6" x2="18" y2="18" />');
  static const chevronDown = WebIconData('ChevronDown', '<polyline points="6 9 12 15 18 9" />');
  static const chevronUp = WebIconData('ChevronUp', '<polyline points="18 15 12 9 6 15" />');
  static const check = WebIconData('Check', '<polyline points="20 6 9 17 4 12" />');
  static const chevronLeft = WebIconData('ChevronLeft', '<polyline points="15 18 9 12 15 6" />');
  static const chevronRight = WebIconData('ChevronRight', '<polyline points="9 18 15 12 9 6" />');
  static const trendingDown = WebIconData('TrendingDown', '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /> <polyline points="17 18 23 18 23 12" />');
  static const banknote = WebIconData('Banknote', '<rect x="2" y="6" width="20" height="12" rx="2" /> <circle cx="12" cy="12" r="2.5" /> <path d="M6 12h.01M18 12h.01" />');
  static const search = WebIconData('Search', '<circle cx="11" cy="11" r="8" /> <line x1="21" y1="21" x2="16.65" y2="16.65" />');
  static const clock = WebIconData('Clock', '<circle cx="12" cy="12" r="10" /> <polyline points="12 6 12 12 16 14" />');
  static const inbox = WebIconData('Inbox', '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /> <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />');
  static const send = WebIconData('Send', '<line x1="22" y1="2" x2="11" y2="13" /> <polygon points="22 2 15 22 11 13 2 9 22 2" />');
  static const eye = WebIconData('Eye', '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /> <circle cx="12" cy="12" r="3" />');

  static const all = [plus, zap, layoutDashboard, listOrdered, target, sparkles, refresh, alertTriangle, checkCircle, mapPin, sun, moon, trash, calendar, arrowRight, fuel, tag, logOut, buildingLibrary, wallet, creditCard, arrowRightLeft, edit, shieldAlert, trendingUp, lock, user, monitor, x, chevronDown, chevronUp, check, chevronLeft, chevronRight, trendingDown, banknote, search, clock, inbox, send, eye];
}
