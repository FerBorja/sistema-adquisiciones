from rest_framework.throttling import UserRateThrottle

class PasswordResetThrottle(UserRateThrottle):
    scope = 'password_reset'

class RegistrationThrottle(UserRateThrottle):
    scope = 'registration'
