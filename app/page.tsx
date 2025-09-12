import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/signin');
  
  // This won't be reached due to the redirect above,
  // but it's here to satisfy TypeScript requirements
  return null;
}
