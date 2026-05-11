import "./globals.css";

export const metadata = {
  title: "RNaves Simulador",
  description: "Nova interface do simulador de treinamento da RNaves.",
  icons: {
    icon: "/Logos/Horizontal%20branco.svg",
    shortcut: "/Logos/Horizontal%20branco.svg",
    apple: "/Logos/Vertical%20branco%20transp.png"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
