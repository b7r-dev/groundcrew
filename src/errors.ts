export class GroundcrewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GroundcrewError';
  }

  toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

export function isGroundcrewError(err: unknown): err is GroundcrewError {
  return err instanceof GroundcrewError;
}
