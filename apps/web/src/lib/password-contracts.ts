import { SignInSchema, SignUpSchema } from '@swipe/contracts';

export const PasswordResetRequestSchema = SignInSchema.pick({ email: true });
export const PasswordUpdateSchema = SignUpSchema.pick({ password: true });
