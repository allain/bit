/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../consumer/bit-inline-id';

export default function commitAction({ id }: { id: string, remote: string }) {
  return loadConsumer()
    .then(consumer => consumer.commit(InlineId.parse(id)));
    // @TODO - maybe need to verify before commit and not after, because error is thrown on commit when the compiler is not exists
    // @TODO - push to remote 
}