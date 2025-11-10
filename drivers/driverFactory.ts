import { DataSource } from '../types';
import { IDatabaseDriver } from './IDatabaseDriver';
import { LocalStorageDriver } from './LocalStorageDriver';
import { GenericSqlDriver } from './GenericSqlDriver';
import { RedisDriver } from './RedisDriver';
import { UnsupportedDriver } from './UnsupportedDriver';
import { MongoDbDriver } from './MongoDbDriver';
import { CosmosDbDriver } from './CosmosDbDriver';
import { SupabaseDriver } from './SupabaseDriver';

// Singleton instances of stateless drivers
const localStorageDriver = new LocalStorageDriver();
const genericSqlDriver = new GenericSqlDriver();
const redisDriver = new RedisDriver();
const mongoDbDriver = new MongoDbDriver();
const cosmosDbDriver = new CosmosDbDriver();
const supabaseDriver = new SupabaseDriver();

export const getDriver = (dataSource: DataSource): IDatabaseDriver => {
  switch (dataSource.type) {
    case 'LocalStorage (Demo)':
      return localStorageDriver;
    
    // All SQL-based databases can use the same generic driver
    case 'PostgreSQL':
    case 'MySQL':
    case 'SQL Server':
      return genericSqlDriver;

    case 'Redis':
        return redisDriver;
    
    case 'MongoDB':
        return mongoDbDriver;
    
    case 'CosmosDB':
        return cosmosDbDriver;

    case 'Supabase':
        return supabaseDriver;

    default:
      // This will handle any unexpected or new database types gracefully.
      const exhaustiveCheck: never = dataSource.type;
      console.error(`Unsupported data source type: ${exhaustiveCheck}`);
      return new UnsupportedDriver(dataSource.type);
  }
};