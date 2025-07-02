// Paleta de cores frias bem distintas para recebíveis
const coolPalette = [
  '#4caf50', // Verde
  '#2196f3', // Azul
  '#00bcd4', // Ciano
  '#7c4dff', // Roxo
  '#009688', // Verde água
  '#1e88e5', // Azul royal
  '#00e676', // Verde limão
  '#3949ab', // Azul escuro
  '#00bfae', // Verde piscina
  '#8e24aa', // Roxo escuro
  '#64b5f6', // Azul claro
  '#43a047', // Verde vibrante
];

// Paleta de cores quentes bem distintas para pagáveis
const warmPalette = [
  '#d32f2f', // Vermelho
  '#ff9800', // Laranja
  '#ffd600', // Amarelo
  '#ff4081', // Rosa
  '#ff6f00', // Laranja queimado
  '#f44336', // Vermelho claro
  '#ffb300', // Amarelo laranja
  '#c2185b', // Rosa escuro
  '#ff1744', // Vermelho vibrante
  '#ffab00', // Amarelo queimado
  '#ff8a65', // Laranja claro
  '#e040fb', // Magenta
];

// Função para gerar cores frias para recebíveis
export const generateCoolColors = (count: number): string[] => {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(coolPalette[i % coolPalette.length]);
  }
  return colors;
};

// Função para gerar cores quentes para pagáveis
export const generateWarmColors = (count: number): string[] => {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(warmPalette[i % warmPalette.length]);
  }
  return colors;
};

// Cores principais para quando não há separação por aging
export const RECEIVABLES_COLOR = '#4caf50'; // Verde principal
export const PAYABLES_COLOR = '#d32f2f'; // Vermelho principal 