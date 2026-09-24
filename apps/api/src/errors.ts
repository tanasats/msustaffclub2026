// error ที่ตั้งใจส่งถึง client ได้ (code และ message ปลอดภัยที่จะแสดง)
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
