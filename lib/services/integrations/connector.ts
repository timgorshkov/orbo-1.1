export type ConnectorCode = 'getcourse' | 'amocrm' | string;

export interface ConnectorTestResult {
  success: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SyncJobSummary {
  success: boolean;
  stats: Record<string, number>;
  message?: string;
  errors?: Array<{ code: string; message: string; context?: Record<string, unknown> }>;
}

export interface IntegrationConnector {
  readonly code: ConnectorCode;
  readonly name: string;
  readonly description?: string;

  testConnection(options: { orgId: string; credentials: Record<string, unknown>; config?: Record<string, unknown> }): Promise<ConnectorTestResult>;

  runSync(options: {
    orgId: string;
    connectionId: string;
    credentials: Record<string, unknown>;
    config?: Record<string, unknown>;
    mode: 'manual' | 'scheduled';
    jobId: string;
  }): Promise<SyncJobSummary>;
}

export interface ConnectorRegistryEntry {
  connector: IntegrationConnector;
  supports: {
    import?: boolean;
    export?: boolean;
    scheduling?: boolean;
  };
}

