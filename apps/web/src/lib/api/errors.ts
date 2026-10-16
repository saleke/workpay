export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  requestId?: string;

  constructor(
    message: string,
    status: number,
    opts: { code?: string; details?: unknown; requestId?: string } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = opts.code;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }
}
