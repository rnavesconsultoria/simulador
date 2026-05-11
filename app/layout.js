import "./globals.css";

export const metadata = {
  title: "RNaves Simulador",
  description: "Nova interface do simulador de treinamento da RNaves.",
  icons: {
    icon: "/Logos/horizontal-white.svg",
    shortcut: "/Logos/horizontal-white.svg",
    apple: "/Logos/vertical-white.png"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
