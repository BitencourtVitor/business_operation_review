import { useEffect } from 'react';
import Login from './Login';

export default function OldAccess() {
  useEffect(() => {
    sessionStorage.setItem('bor1_access', 'true');
  }, []);

  return <Login />;
}
