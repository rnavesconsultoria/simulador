import "./globals.css";

export const metadata = {
  title: "RNaves Simulador",
  description: "Nova interface do simulador de treinamento da RNaves.",
  icons: {
    icon: "/Logos/Horizontal branco transp.svg",
    shortcut: "/Logos/Horizontal branco transp.svg",
    apple: "/Logos/Vertical branco transp.png"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
