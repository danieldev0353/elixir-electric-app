import {
  SatInStopReplicationResp,
  SatInStartReplicationResp,
  SatOpCommit,
  SatOpBegin,
  SatOpLog,
  SatPingReq,
  SatOpInsert,
  SatRelation,
  SatRelationColumn,
  SatRelation_RelationType,
  SatOpUpdate,
  SatOpDelete,
  SatTransOp,
  SatAuthResp,
} from '../../src/_generated/proto/satellite';
import { WebSocketNode } from '../../src/sockets/node/websocket';
import { AckCallback, SatelliteClientErrorCode, SatelliteError, SatelliteWSClient, Transaction } from '../../src/satellite/client';
import { SatelliteWSServerStub } from './server_ws_stub';
import test from 'ava'
import Long from 'long';

test.beforeEach(t => {
  const server = new SatelliteWSServerStub();
  server.start();

  const socket = new WebSocketNode();
  const client = new SatelliteWSClient(socket, {
    appId: "fake_id",
    token: "fake_token",
    address: '127.0.0.1',
    port: 30002,
    timeout: 10000
  });

  t.context = {
    server,
    client
  }
});

test.afterEach.always(async t => {
  const { server, client } = t.context as any;

  await client.close();
  server.close();
});

test.serial('connect success', async t => {
  const { client } = t.context as any;

  await client.connect();
  t.pass();
});

// TODO: handle connection errors scenarios

async function connectAndAuth({ client, server }) {
  await client.connect();

  const authResp = SatAuthResp.fromPartial({});
  server.nextResponses([authResp]);
  await client.authenticate();
}

test.serial('replication start timeout', async t => {
  const { client, server } = t.context as any;
  client.opts.timeout = 10
  await client.connect();

  // empty response will trigger client timeout
  server.nextResponses([]); 
  try {
    await client.startReplication("0", false);
    t.fail(`start replication should throw`);
  } catch (error) {
    t.is((error as SatelliteError).code, SatelliteClientErrorCode.TIMEOUT);
  }
});

test.serial('authentication success', async t => {
  const { client, server } = t.context as any;
  await client.connect();

  const authResp = SatAuthResp.fromPartial({ id: "FAKE" });
  server.nextResponses([authResp]);

  const res = await client.authenticate();
  t.is(res.serverId, "FAKE");
  t.is(client.inbound.authenticated, true);

});

test.serial('replication start success', async t => {
  await connectAndAuth(t.context as any);
  const { client, server } = t.context as any;

  const startResp = SatInStartReplicationResp.fromPartial({});
  server.nextResponses([startResp]);

  await client.startReplication("0", false);
  t.pass();
});

test.serial('replication start failure', async t => {
  await connectAndAuth(t.context as any);
  const { client, server } = t.context as any;

  const startResp = SatInStartReplicationResp.fromPartial({});
  server.nextResponses([startResp]);

  try {
    await client.startReplication("0", false);
    await client.startReplication("0", false); // fails
  } catch (error) {
    t.is((error as any).code, SatelliteClientErrorCode.REPLICATION_ALREADY_STARTED);
  }
});

test.serial('replication stop success', async t => {
  await connectAndAuth(t.context as any);
  const { client, server } = t.context as any;

  const start = SatInStartReplicationResp.fromPartial({});
  const stop = SatInStopReplicationResp.fromPartial({});
  server.nextResponses([start]);
  server.nextResponses([stop]);

  await client.startReplication("0");
  await client.stopReplication();
  t.pass();
});

test.serial('replication stop failure', async t => {
  await connectAndAuth(t.context as any);
  const { client, server } = t.context as any;

  const stop = SatInStopReplicationResp.fromPartial({});
  server.nextResponses([stop]);

  try {
    await client.stopReplication();
    t.fail(`stop replication should throw`);
  } catch (error) {
    t.is((error as any).code, SatelliteClientErrorCode.REPLICATION_NOT_STARTED);
  }
});

test.serial('server pings client', async t => {
  await connectAndAuth(t.context as any);
  const { client, server } = t.context as any;

  const start = SatInStartReplicationResp.fromPartial({});
  const ping = SatPingReq.fromPartial({});
  const stop = SatInStopReplicationResp.fromPartial({});

  return new Promise(async (resolve) => {
    server.nextResponses([start, ping]);
    server.nextResponses([() => {
      t.pass();
      resolve();
    }]);
    server.nextResponses([stop]);

    await client.startReplication("0");
    await client.stopReplication();
  });
});

test.serial('receive transaction', async t => {
  await connectAndAuth(t.context as any);
  const { client, server } = t.context as any;

  const start = SatInStartReplicationResp.fromPartial({});
  const begin = SatOpBegin.fromPartial({ lsn: "FAKE", commitTimestamp: Long.ZERO });
  const commit = SatOpCommit.fromPartial({});

  const relation = SatRelation.fromPartial({
    relationId: 1,
    schemaName: 'schema',
    tableName: 'table',
    tableType: SatRelation_RelationType.TABLE,
    columns: [
      SatRelationColumn.fromPartial({ name: 'name1', type: 'varchar' }),
      SatRelationColumn.fromPartial({ name: 'name2', type: 'varchar' })
    ]
  });

  const encoder = new TextEncoder();

  const insertOp = SatOpInsert.fromPartial({
    relationId: 1,
    rowData: [encoder.encode("Foo"), encoder.encode("Bar")]
  });
  const updateOp = SatOpUpdate.fromPartial({
    relationId: 1,
    rowData: [encoder.encode("Hello"), encoder.encode("World!")],
    oldRowData: [encoder.encode(""), encoder.encode("")]
  });
  const deleteOp = SatOpDelete.fromPartial({
    relationId: 1,
    oldRowData: [encoder.encode("Hello"), encoder.encode("World!")]
  });

  const opLog = SatOpLog.fromPartial({
    ops: [
      SatTransOp.fromPartial({ begin }),
      SatTransOp.fromPartial({ insert: insertOp }),
      SatTransOp.fromPartial({ update: updateOp }),
      SatTransOp.fromPartial({ delete: deleteOp }),
      SatTransOp.fromPartial({ commit }),
    ]
  });

  const stop = SatInStopReplicationResp.fromPartial({});

  server.nextResponses([start, relation, opLog]);
  server.nextResponses([stop]);

  await new Promise<void>(async (res) => {
    client.on('transaction', (transaction: Transaction) => {
      t.is(transaction.changes.length, 3);
      res();
    });

    await client.startReplication("0");
  });
});

test.serial('acknowledge lsn', async t => {
  await connectAndAuth(t.context as any);
  const { client, server } = t.context as any;

  const start = SatInStartReplicationResp.fromPartial({});
  const begin = SatOpBegin.fromPartial({ lsn: "FAKE", commitTimestamp: Long.ZERO });
  const commit = SatOpCommit.fromPartial({});

  const opLog = SatOpLog.fromPartial({
    ops: [
      SatTransOp.fromPartial({ begin }),
      SatTransOp.fromPartial({ commit }),
    ]
  });

  const stop = SatInStopReplicationResp.fromPartial({});

  server.nextResponses([start, opLog]);
  server.nextResponses([stop]);

  await new Promise<void>(async (res) => {
    client.on('transaction', (_t: Transaction, ack: AckCallback) => {
      t.is(client.inbound.lsn, "0");
      ack();
      t.is(client.inbound.lsn, "FAKE");
      res();
    });

    await client.startReplication("0");
  });
});

