import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'First / Swipe-to-Hire employer workspace',
  description: 'A synthetic demo of skills-first hiring for students and local employers.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
