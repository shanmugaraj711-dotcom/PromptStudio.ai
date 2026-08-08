import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PromptHistory from '../pages/Result/PromptHistory';
import * as AuthContextModule from '../context/AuthContext';
import * as PromptHistoryHookModule from '../hooks/usePromptHistory';

describe('PromptHistory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a sign-in message for unauthenticated users', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      loading: false,
    });

    vi.spyOn(PromptHistoryHookModule, 'usePromptHistory').mockReturnValue({
      history: [],
      loading: false,
      error: '',
      removePrompt: vi.fn(),
    });

    render(
      <MemoryRouter>
        <PromptHistory />
      </MemoryRouter>
    );

    expect(screen.getByText(/sign in to view your saved prompts/i)).toBeTruthy();
  });
});
