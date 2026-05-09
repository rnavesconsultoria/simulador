import "./globals.css";

export const metadata = {
  title: "RNaves Simulador",
  description: "Nova interface do simulador de treinamento da RNaves."
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
