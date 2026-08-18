import { redirect } from 'next/navigation';

/** The console has no landing page — staff go straight to the work. */
export default function RootPage() {
  redirect('/queue');
}
