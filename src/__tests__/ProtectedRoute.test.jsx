import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as AuthContextModule from '../context/AuthContext';
import { ProtectedRoute } from '../components/ProtectedRoute';

function TestApp({ user }) {
  // Mock the useAuth hook from AuthContext module (ESM-safe)
  vi.spyOn(AuthContextModule, 'useAuth').mockImplementation(() => ({ user, loading: false }));

  return (
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div>Secret</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirects to login when unauthenticated', () => {
    render(<TestApp user={null} />);
    expect(screen.getByText(/Login/)).toBeTruthy();
  });
});
