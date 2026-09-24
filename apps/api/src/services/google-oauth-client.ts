import { CodeChallengeMethod, OAuth2Client, type TokenPayload } from 'google-auth-library';
import { config } from '../config/index.js';

// จุดเดียวในระบบที่คุยกับ Google (test จะ mock เฉพาะ exchangeCodeForVerifiedIdToken)
const client = new OAuth2Client({
  clientId: config.google.clientId,
  clientSecret: config.google.clientSecret,
  redirectUri: config.google.redirectUri,
});

export interface AuthorizationUrlInput {
  state: string;
  nonce: string;
  codeChallenge: string;
}

export type GoogleIdTokenPayload = TokenPayload;

export const googleOAuth = {
  // สร้าง PKCE verifier + challenge (คำนวณในเครื่อง ไม่เรียกเครือข่าย)
  async createPkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    if (!codeChallenge) {
      throw new Error('สร้าง PKCE code challenge ไม่สำเร็จ');
    }
    return { codeVerifier, codeChallenge };
  },

  buildAuthorizationUrl(input: AuthorizationUrlInput): string {
    return client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      // hd เป็นแค่คำแนะนำให้หน้า Google แสดงบัญชีโดเมนนี้ (UX) การตรวจจริงทำหลังได้ ID token
      ...(config.google.allowedEmailDomains.length === 1 ? { hd: config.google.allowedEmailDomains[0] } : {}),
      prompt: 'select_account',
    });
  },

  /**
   * แลก authorization code เป็น token แล้วตรวจ ID token
   * verifyIdToken ตรวจ signature (กับ public key ของ Google), aud, iss และ exp ให้
   * ส่วน nonce, email_verified และโดเมน ตรวจต่อใน auth-service
   */
  async exchangeCodeForVerifiedIdToken(input: { code: string; codeVerifier: string }): Promise<GoogleIdTokenPayload> {
    const { tokens } = await client.getToken({ code: input.code, codeVerifier: input.codeVerifier });
    if (!tokens.id_token) {
      throw new Error('Google ไม่ได้ส่ง id_token กลับมา');
    }
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.google.clientId });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('อ่านข้อมูลใน ID token ไม่ได้');
    }
    return payload;
  },
};
