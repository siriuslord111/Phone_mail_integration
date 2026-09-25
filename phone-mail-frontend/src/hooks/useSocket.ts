import { useContext } from 'react';
import { SocketContext } from '../context/SocketProvider';

export function useSocket() {
  return useContext(SocketContext);
}
