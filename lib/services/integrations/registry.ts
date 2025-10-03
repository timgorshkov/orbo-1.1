import { ConnectorRegistryEntry, IntegrationConnector } from './connector';
import { GetCourseConnector } from './getcourse';

class ConnectorRegistry {
  private readonly connectors = new Map<string, ConnectorRegistryEntry>();

  register(entry: ConnectorRegistryEntry) {
    this.connectors.set(entry.connector.code, entry);
  }

  get(code: string): IntegrationConnector | null {
    return this.connectors.get(code)?.connector ?? null;
  }

  list(): ConnectorRegistryEntry[] {
    return Array.from(this.connectors.values());
  }
}

export const connectorRegistry = new ConnectorRegistry();

connectorRegistry.register({
  connector: new GetCourseConnector(),
  supports: { import: true, scheduling: true }
});

