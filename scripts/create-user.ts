import { createUser } from '../src/shared/auth/repository.ts';

const user = createUser();
console.log(`User code: ${user.code}`);
console.log(`Access token (store securely; shown only once): ${user.token}`);
