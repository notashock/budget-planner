# flutter_secure_storage uses Google Tink, which references compile-time-only
# annotations (errorprone, JSR-305) that are not shipped at runtime. Without
# these rules R8 fails the release build with "Missing class ...".
-dontwarn com.google.errorprone.annotations.CanIgnoreReturnValue
-dontwarn com.google.errorprone.annotations.CheckReturnValue
-dontwarn com.google.errorprone.annotations.Immutable
-dontwarn com.google.errorprone.annotations.RestrictedApi
-dontwarn javax.annotation.Nullable
-dontwarn javax.annotation.concurrent.GuardedBy
