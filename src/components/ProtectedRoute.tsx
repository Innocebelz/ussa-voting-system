import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If we are generally protecting routes, we might want to ensure they 
  // only see results if they have voted. For /results specifically:
  if (!user.hasVoted) {
    return <Navigate to="/voting-booth" replace />;
  }

  return <Outlet />;
};

export const GuestRoute: React.FC = () => {
  const { user } = useAuth();

  if (user) {
    return user.hasVoted ? <Navigate to="/results" replace /> : <Navigate to="/voting-booth" replace />;
  }

  return <Outlet />;
};

export const VotingRoute: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to results if already voted
  if (user.hasVoted) {
    return <Navigate to="/results" replace />;
  }

  return <Outlet />;
};
