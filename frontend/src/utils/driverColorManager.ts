// Utilitário para gerenciar cores consistentes para cada motorista
export class DriverColorManager {
  private static instance: DriverColorManager;
  private driverColors: Map<string, string> = new Map();
  private colorIndex = 0;
  
  // Paleta de cores para motoristas
  private readonly colors = [
    '#ff6b35', // Laranja
    '#4ecdc4', // Turquesa
    '#45b7d1', // Azul claro
    '#96ceb4', // Verde claro
    '#feca57', // Amarelo
    '#ff9ff3', // Rosa
    '#54a0ff', // Azul
    '#5f27cd', // Roxo
    '#00d2d3', // Ciano
    '#ff9f43', // Laranja escuro
    '#10ac84', // Verde escuro
    '#5f27cd', // Roxo escuro
    '#ff6348', // Vermelho
    '#2ed573', // Verde
    '#1e90ff', // Azul dodger
    '#ffa502'  // Laranja
  ];

  private constructor() {}

  public static getInstance(): DriverColorManager {
    if (!DriverColorManager.instance) {
      DriverColorManager.instance = new DriverColorManager();
    }
    return DriverColorManager.instance;
  }

  // Obter cor para um motorista específico
  public getDriverColor(driverName: string): string {
    if (this.driverColors.has(driverName)) {
      return this.driverColors.get(driverName)!;
    }

    // Atribuir nova cor
    const color = this.colors[this.colorIndex % this.colors.length];
    this.driverColors.set(driverName, color);
    this.colorIndex++;

    return color;
  }

  // Obter cor com opacidade para motoristas não selecionados
  public getDriverColorWithOpacity(driverName: string, opacity: number = 0.5): string {
    const baseColor = this.getDriverColor(driverName);
    return this.addOpacity(baseColor, opacity);
  }

  // Adicionar opacidade a uma cor hex
  private addOpacity(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // Limpar cache de cores (útil para reset)
  public clearCache(): void {
    this.driverColors.clear();
    this.colorIndex = 0;
  }

  // Obter todas as cores atribuídas
  public getAllDriverColors(): Map<string, string> {
    return new Map(this.driverColors);
  }
}

// Função helper para obter a instância
export const getDriverColorManager = (): DriverColorManager => {
  return DriverColorManager.getInstance();
};
