import type { Metadata } from 'next';
import { MantineProvider, createTheme, ColorSchemeScript } from '@mantine/core';
import '@mantine/core/styles.css';
import './globals.css';

const theme = createTheme({
  //colorScheme: 'dark',
  primaryColor: 'yellow',
  fontFamily: 'JetBrains Mono, monospace',
  defaultRadius: 'md',
  colors: {
    dark: [
      '#e8eaf6', '#8892b0', '#4a5378', '#2d3450',
      '#252a3d', '#1e2338', '#181c2a', '#11141f',
      '#0b0d14', '#08090f',
    ],
  },
});

export const metadata: Metadata = {
  title: 'ELD Trip Planner',
  description: 'FMCSA-compliant Hours of Service trip planner with automatic ELD log generation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mantine-color-scheme="dark">
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}