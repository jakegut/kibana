/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { IValidatedEvent } from '@kbn/event-log-plugin/server';
import { UserAtSpaceScenarios } from '../../scenarios';
import {
  ESTestIndexTool,
  ES_TEST_INDEX_NAME,
  getUrlPrefix,
  ObjectRemover,
  getEventLog,
} from '../../../common/lib';
import { FtrProviderContext } from '../../../common/ftr_provider_context';

const NANOS_IN_MILLIS = 1000 * 1000;

// eslint-disable-next-line import/no-default-export
export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const retry = getService('retry');
  const esTestIndexTool = new ESTestIndexTool(es, retry);

  const authorizationIndex = '.kibana-test-authorization';

  describe('execute', () => {
    const objectRemover = new ObjectRemover(supertest);

    before(async () => {
      await esTestIndexTool.destroy();
      await esTestIndexTool.setup();
      await es.indices.create({ index: authorizationIndex });
    });
    after(async () => {
      await esTestIndexTool.destroy();
      await es.indices.delete({ index: authorizationIndex });
      await objectRemover.removeAll();
    });

    for (const scenario of UserAtSpaceScenarios) {
      const { user, space } = scenario;
      describe(scenario.id, () => {
        it('should handle execute request appropriately', async () => {
          const { body: createdAction } = await supertest
            .post(`${getUrlPrefix(space.id)}/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'My action',
              connector_type_id: 'test.index-record',
              config: {
                unencrypted: `This value shouldn't get encrypted`,
              },
              secrets: {
                encrypted: 'This value should be encrypted',
              },
            })
            .expect(200);
          objectRemover.add(space.id, createdAction.id, 'action', 'actions');

          const reference = `actions-execute-1:${user.username}`;
          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/actions/connector/${createdAction.id}/_execute`)
            .auth(user.username, user.password)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                reference,
                index: ES_TEST_INDEX_NAME,
                message: 'Testing 123',
              },
            });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all_alerts_none_actions at space1':
            case 'space_1_all at space2':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                statusCode: 403,
                error: 'Forbidden',
                message: 'Unauthorized to execute actions',
              });
              break;
            case 'global_read at space1':
            case 'superuser at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);
              expect(response.body).to.be.an('object');
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(1);
              const indexedRecord = searchResult.body.hits.hits[0];
              expect(indexedRecord._source).to.eql({
                params: {
                  reference,
                  index: ES_TEST_INDEX_NAME,
                  message: 'Testing 123',
                },
                config: {
                  unencrypted: `This value shouldn't get encrypted`,
                },
                secrets: {
                  encrypted: 'This value should be encrypted',
                },
                reference,
                source: 'action:test.index-record',
              });

              await validateEventLog({
                spaceId: space.id,
                connectorId: createdAction.id,
                outcome: 'success',
                actionTypeId: 'test.index-record',
                message: `action executed: test.index-record:${createdAction.id}: My action`,
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it(`shouldn't execute an action from another space`, async () => {
          const { body: createdAction } = await supertest
            .post(`${getUrlPrefix(space.id)}/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'My action',
              connector_type_id: 'test.index-record',
              config: {
                unencrypted: `This value shouldn't get encrypted`,
              },
              secrets: {
                encrypted: 'This value should be encrypted',
              },
            })
            .expect(200);
          objectRemover.add(space.id, createdAction.id, 'action', 'actions');

          const reference = `actions-execute-4:${user.username}`;
          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix('other')}/api/actions/connector/${createdAction.id}/_execute`)
            .auth(user.username, user.password)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                reference,
                index: ES_TEST_INDEX_NAME,
                message: 'Testing 123',
              },
            });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all_alerts_none_actions at space1':
            case 'space_1_all at space2':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                statusCode: 403,
                error: 'Forbidden',
                message: 'Unauthorized to execute actions',
              });
              break;
            case 'global_read at space1':
            case 'superuser at space1':
              expect(response.statusCode).to.eql(404);
              expect(response.body).to.eql({
                statusCode: 404,
                error: 'Not Found',
                message: `Saved object [action/${createdAction.id}] not found`,
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should handle execute request appropriately after action is updated', async () => {
          const { body: createdAction } = await supertest
            .post(`${getUrlPrefix(space.id)}/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'My action',
              connector_type_id: 'test.index-record',
              config: {
                unencrypted: `This value shouldn't get encrypted`,
              },
              secrets: {
                encrypted: 'This value should be encrypted',
              },
            })
            .expect(200);
          objectRemover.add(space.id, createdAction.id, 'action', 'actions');

          await supertest
            .put(`${getUrlPrefix(space.id)}/api/actions/connector/${createdAction.id}`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'My action updated',
              config: {
                unencrypted: `This value shouldn't get encrypted`,
              },
              secrets: {
                encrypted: 'This value should be encrypted',
              },
            })
            .expect(200);

          const reference = `actions-execute-2:${user.username}`;
          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/actions/connector/${createdAction.id}/_execute`)
            .auth(user.username, user.password)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                reference,
                index: ES_TEST_INDEX_NAME,
                message: 'Testing 123',
              },
            });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all_alerts_none_actions at space1':
            case 'space_1_all at space2':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                statusCode: 403,
                error: 'Forbidden',
                message: 'Unauthorized to execute actions',
              });
              break;
            case 'global_read at space1':
            case 'superuser at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);
              expect(response.body).to.be.an('object');
              const searchResult = await esTestIndexTool.search(
                'action:test.index-record',
                reference
              );
              // @ts-expect-error doesnt handle total: number
              expect(searchResult.body.hits.total.value).to.eql(1);
              const indexedRecord = searchResult.body.hits.hits[0];
              expect(indexedRecord._source).to.eql({
                params: {
                  reference,
                  index: ES_TEST_INDEX_NAME,
                  message: 'Testing 123',
                },
                config: {
                  unencrypted: `This value shouldn't get encrypted`,
                },
                secrets: {
                  encrypted: 'This value should be encrypted',
                },
                reference,
                source: 'action:test.index-record',
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it(`should handle execute request appropriately when action doesn't exist`, async () => {
          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/actions/connector/1/_execute`)
            .auth(user.username, user.password)
            .set('kbn-xsrf', 'foo')
            .send({
              params: { foo: true },
            });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all_alerts_none_actions at space1':
            case 'space_1_all at space2':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                statusCode: 403,
                error: 'Forbidden',
                message: 'Unauthorized to execute actions',
              });
              break;
            case 'global_read at space1':
            case 'superuser at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(404);
              expect(response.body).to.eql({
                statusCode: 404,
                error: 'Not Found',
                message: 'Saved object [action/1] not found',
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should handle execute request appropriately when payload is empty and invalid', async () => {
          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/actions/connector/1/_execute`)
            .auth(user.username, user.password)
            .set('kbn-xsrf', 'foo')
            .send({});

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all_alerts_none_actions at space1':
            case 'space_1_all at space2':
            case 'global_read at space1':
            case 'superuser at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(400);
              expect(response.body).to.eql({
                statusCode: 400,
                error: 'Bad Request',
                message:
                  '[request body.params]: expected value of type [object] but got [undefined]',
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should handle execute request appropriately after changing config properties', async () => {
          const { body: createdAction } = await supertest
            .post(`${getUrlPrefix(space.id)}/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'test email action',
              connector_type_id: '.email',
              config: {
                from: 'email-from-1@example.com',
                // this host is specifically added to allowedHosts in:
                //    x-pack/test/alerting_api_integration/common/config.ts
                host: 'some.non.existent.com',
                port: 666,
              },
              secrets: {
                user: 'email-user',
                password: 'email-password',
              },
            })
            .expect(200);
          objectRemover.add(space.id, createdAction.id, 'action', 'actions');

          await supertest
            .put(`${getUrlPrefix(space.id)}/api/actions/connector/${createdAction.id}`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'a test email action 2',
              config: {
                from: 'email-from-2@example.com',
                service: '__json',
              },
              secrets: {
                user: 'email-user',
                password: 'email-password',
              },
            })
            .expect(200);

          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/actions/connector/${createdAction.id}/_execute`)
            .auth(user.username, user.password)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                to: ['X'],
                subject: 'email-subject',
                message: 'email-message',
              },
            });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all_alerts_none_actions at space1':
            case 'space_1_all at space2':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                statusCode: 403,
                error: 'Forbidden',
                message: 'Unauthorized to execute actions',
              });
              break;
            case 'global_read at space1':
            case 'superuser at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });

        it('should handle execute request appropriately and have proper callCluster and savedObjectsClient authorization', async () => {
          let indexedRecord: any;
          let searchResult: any;
          const reference = `actions-execute-3:${user.username}`;
          const { body: createdAction } = await supertest
            .post(`${getUrlPrefix(space.id)}/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'My action',
              connector_type_id: 'test.authorization',
            })
            .expect(200);
          objectRemover.add(space.id, createdAction.id, 'action', 'actions');

          const response = await supertestWithoutAuth
            .post(`${getUrlPrefix(space.id)}/api/actions/connector/${createdAction.id}/_execute`)
            .auth(user.username, user.password)
            .set('kbn-xsrf', 'foo')
            .send({
              params: {
                callClusterAuthorizationIndex: authorizationIndex,
                savedObjectsClientType: 'dashboard',
                savedObjectsClientId: '1',
                index: ES_TEST_INDEX_NAME,
                reference,
              },
            });

          switch (scenario.id) {
            case 'no_kibana_privileges at space1':
            case 'space_1_all_alerts_none_actions at space1':
            case 'space_1_all at space2':
              expect(response.statusCode).to.eql(403);
              expect(response.body).to.eql({
                statusCode: 403,
                error: 'Forbidden',
                message: 'Unauthorized to execute actions',
              });
              break;
            case 'global_read at space1':
            case 'space_1_all at space1':
            case 'space_1_all_with_restricted_fixture at space1':
              expect(response.statusCode).to.eql(200);
              searchResult = await esTestIndexTool.search('action:test.authorization', reference);
              expect(searchResult.body.hits.total.value).to.eql(1);
              indexedRecord = searchResult.body.hits.hits[0];
              expect(indexedRecord._source.state).to.eql({
                callClusterSuccess: false,
                callScopedClusterSuccess: false,
                savedObjectsClientSuccess: false,
                callClusterError: {
                  ...indexedRecord._source.state.callClusterError,
                },
                callScopedClusterError: {
                  ...indexedRecord._source.state.callScopedClusterError,
                },
                savedObjectsClientError: {
                  ...indexedRecord._source.state.savedObjectsClientError,
                  output: {
                    ...indexedRecord._source.state.savedObjectsClientError.output,
                    statusCode: 403,
                  },
                },
              });
              break;
            case 'superuser at space1':
              expect(response.statusCode).to.eql(200);
              searchResult = await esTestIndexTool.search('action:test.authorization', reference);
              expect(searchResult.body.hits.total.value).to.eql(1);
              indexedRecord = searchResult.body.hits.hits[0];
              expect(indexedRecord._source.state).to.eql({
                callClusterSuccess: true,
                callScopedClusterSuccess: true,
                savedObjectsClientSuccess: false,
                savedObjectsClientError: {
                  ...indexedRecord._source.state.savedObjectsClientError,
                  output: {
                    ...indexedRecord._source.state.savedObjectsClientError.output,
                    statusCode: 404,
                  },
                },
              });
              break;
            default:
              throw new Error(`Scenario untested: ${JSON.stringify(scenario)}`);
          }
        });
      });
    }
  });

  interface ValidateEventLogParams {
    spaceId: string;
    connectorId: string;
    actionTypeId: string;
    outcome: string;
    message: string;
    errorMessage?: string;
  }

  async function validateEventLog(params: ValidateEventLogParams): Promise<void> {
    const { spaceId, connectorId, actionTypeId, outcome, message, errorMessage } = params;

    const events: IValidatedEvent[] = await retry.try(async () => {
      return await getEventLog({
        getService,
        spaceId,
        type: 'action',
        id: connectorId,
        provider: 'actions',
        actions: new Map([
          ['execute-start', { equal: 1 }],
          ['execute', { equal: 1 }],
        ]),
        // filter: 'event.action:(execute)',
      });
    });

    const startExecuteEvent = events[0];
    const executeEvent = events[1];

    const duration = executeEvent?.event?.duration;
    const executeEventStart = Date.parse(executeEvent?.event?.start || 'undefined');
    const startExecuteEventStart = Date.parse(startExecuteEvent?.event?.start || 'undefined');
    const executeEventEnd = Date.parse(executeEvent?.event?.end || 'undefined');
    const dateNow = Date.now();

    expect(typeof duration).to.be('number');
    expect(executeEventStart).to.be.ok();
    expect(startExecuteEventStart).to.equal(executeEventStart);
    expect(executeEventEnd).to.be.ok();

    const durationDiff = Math.abs(
      Math.round(duration! / NANOS_IN_MILLIS) - (executeEventEnd - executeEventStart)
    );

    // account for rounding errors
    expect(durationDiff < 1).to.equal(true);
    expect(executeEventStart <= executeEventEnd).to.equal(true);
    expect(executeEventEnd <= dateNow).to.equal(true);

    expect(executeEvent?.event?.outcome).to.equal(outcome);

    expect(executeEvent?.kibana?.saved_objects).to.eql([
      {
        rel: 'primary',
        type: 'action',
        id: connectorId,
        namespace: 'space1',
        type_id: actionTypeId,
      },
    ]);
    expect(startExecuteEvent?.kibana?.saved_objects).to.eql(executeEvent?.kibana?.saved_objects);

    expect(executeEvent?.message).to.eql(message);
    expect(startExecuteEvent?.message).to.eql(message.replace('executed', 'started'));

    if (errorMessage) {
      expect(executeEvent?.error?.message).to.eql(errorMessage);
    }

    // const event = events[0];

    // const duration = event?.event?.duration;
    // const eventStart = Date.parse(event?.event?.start || 'undefined');
    // const eventEnd = Date.parse(event?.event?.end || 'undefined');
    // const dateNow = Date.now();

    // expect(typeof duration).to.be('number');
    // expect(eventStart).to.be.ok();
    // expect(eventEnd).to.be.ok();

    // const durationDiff = Math.abs(
    //   Math.round(duration! / NANOS_IN_MILLIS) - (eventEnd - eventStart)
    // );

    // // account for rounding errors
    // expect(durationDiff < 1).to.equal(true);
    // expect(eventStart <= eventEnd).to.equal(true);
    // expect(eventEnd <= dateNow).to.equal(true);

    // expect(event?.event?.outcome).to.equal(outcome);

    // expect(event?.kibana?.saved_objects).to.eql([
    //   {
    //     rel: 'primary',
    //     type: 'action',
    //     id: connectorId,
    //     type_id: actionTypeId,
    //     namespace: spaceId,
    //   },
    // ]);

    // expect(event?.message).to.eql(message);

    // if (errorMessage) {
    //   expect(event?.error?.message).to.eql(errorMessage);
    // }
  }
}
