import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ECTI Paysagiste',
  description: 'Démo Géoplateforme IGN avec geopf-extensions-openlayers',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
