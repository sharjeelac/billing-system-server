const {User} = require('./server')
const bcrypt = require('bcryptjs');
async function seedAdmin() {
  const adminExists = await User.findOne({ username: 'admin' });
  if (!adminExists) {
   const Createduser =  await User.create({
      username: 'admin',
      password: 'admin123',
      role: 'admin',
    });
    console.log(Createduser,'Admin user created');
  }
}
seedAdmin();