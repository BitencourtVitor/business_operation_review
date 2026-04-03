import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface GlobalFeedbackContextType {
  isLoading: boolean;
  isSuccess: boolean;
  startLoading: () => void;
  stopLoading: () => void;
  showSuccess: () => void;
}

const GlobalFeedbackContext = createContext<GlobalFeedbackContextType | undefined>(undefined);

export const GlobalFeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const startLoading = useCallback(() => {
    setIsLoading(true);
    setIsSuccess(false);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  const showSuccess = useCallback(() => {
    setIsLoading(false);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
    }, 2000); // Mostra o check por 2 segundos
  }, []);

  return (
    <GlobalFeedbackContext.Provider value={{ isLoading, isSuccess, startLoading, stopLoading, showSuccess }}>
      {children}
    </GlobalFeedbackContext.Provider>
  );
};

export const useGlobalFeedback = () => {
  const context = useContext(GlobalFeedbackContext);
  if (context === undefined) {
    throw new Error('useGlobalFeedback must be used within a GlobalFeedbackProvider');
  }
  return context;
};
