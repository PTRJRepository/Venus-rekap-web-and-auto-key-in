/**
 * ErrorState — stateless error display for MatrixPage's Main_Workspace.
 *
 * Rendered when the Monthly_Grid_API request fails or returns a non-2xx
 * response. Shows a centered icon, heading, optional message, and a
 * "Coba Lagi" retry button. All copy is in Indonesian.
 *
 * Requirements: 13.4
 */
import { Box, Button, Stack, Typography } from '@mui/material';
import { ErrorOutlineRounded } from '@mui/icons-material';
import { tokens } from '../tokens';

export interface ErrorStateProps {
  /**
   * Optional Indonesian-language error message. Falls back to a generic
   * message when omitted.
   */
  message?: string;
  /**
   * Invoked when the user clicks the "Coba Lagi" button. The parent is
   * expected to re-trigger the failed request.
   */
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps): React.ReactElement {
  const resolvedMessage = message ?? 'Terjadi kesalahan saat memuat data kehadiran.';

  return (
    <Box
      sx={{
        width: '100%',
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      <Stack spacing={2} alignItems="center">
        <ErrorOutlineRounded
          sx={{
            fontSize: 56,
            color: tokens.accent.red,
          }}
        />
        <Typography
          variant="h6"
          sx={{
            fontSize: 18,
            fontWeight: 600,
            color: tokens.text.primary,
          }}
        >
          Gagal memuat data
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: tokens.text.secondary,
            maxWidth: 480,
          }}
        >
          {resolvedMessage}
        </Typography>
        <Button variant="contained" color="primary" onClick={onRetry}>
          Coba Lagi
        </Button>
      </Stack>
    </Box>
  );
}

export default ErrorState;
