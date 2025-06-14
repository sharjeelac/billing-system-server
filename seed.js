// seed.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const seedAdmin = async () => {
  await mongoose.connect('mongodb://localhost:27017/billing-system');
  const email = 'admin@example.com';
  const password = 'your_secure_password';
  const hashedPassword = await bcrypt.hash(password, 10);

  await User.deleteMany({});
  const user = await User.create({ email, password: hashedPassword, role: 'admin' });
console.log(user)
  console.log('Admin user created');
  mongoose.connection.close();
};

seedAdmin();