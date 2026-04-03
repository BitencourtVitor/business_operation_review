// Cores específicas para os status do WinProgress/Takeoff
// Seguindo o padrão do WinProgress com cores mais vibrantes e consistentes

// Cores dos status do WinProgress
export const TAKEOFF_STATUS_COLORS = {
  'Not Started': '#dc3545', // Vermelho - não iniciado
  'In Progress': '#ffb300', // Amarelo mais escuro - em progresso (mais legível)
  'Completed': '#1bbf5c', // Verde - concluído
  'Pending': '#6c757d', // Cinza - pendente
} as const;

// Função para obter cor do status
export const getTakeoffStatusColor = (status: keyof typeof TAKEOFF_STATUS_COLORS): string => {
  return TAKEOFF_STATUS_COLORS[status];
};

// Função para gerar cores para gráficos de pizza
export const generateTakeoffColors = (labels: string[]): string[] => {
  return labels.map(label => {
    const status = label as keyof typeof TAKEOFF_STATUS_COLORS;
    return TAKEOFF_STATUS_COLORS[status] || '#6c757d';
  });
};

// Função para gerar cores de borda (versão mais clara para hover)
export const generateTakeoffBorderColors = (labels: string[]): string[] => {
  return labels.map(label => {
    const status = label as keyof typeof TAKEOFF_STATUS_COLORS;
    const baseColor = TAKEOFF_STATUS_COLORS[status] || '#6c757d';
    // Adicionar transparência para criar efeito de borda
    return baseColor + '80';
  });
}; 