import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'missing-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'missing-client-secret',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:4000/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  // ⚡ FORCES GOOGLE TO SHOW ACCOUNT PICKER & CONSENT SCREEN EVERY TIME
  override authorizationParams(): { [key: string]: string } {
    return {
      prompt: 'select_account consent', // 'select_account' opens the picker; 'consent' forces the permissions screen
      access_type: 'offline',
    };
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { name, emails, photos } = profile;
    const user = {
      email: emails?.[0]?.value,
      fullName:
        `${name?.givenName || ''} ${name?.familyName || ''}`.trim() ||
        emails?.[0]?.value?.split('@')[0] ||
        'Northstar User',
      avatarUrl: photos?.[0]?.value || null,
    };
    done(null, user);
  }
}