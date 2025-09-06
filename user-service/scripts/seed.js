import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://mongo:27017/todo';

const userSchema = new mongoose.Schema({
  name: String, email: { type: String, unique: true }, passwordHash: String
});
const User = mongoose.model('User', userSchema);

(async () => {
  await mongoose.connect(mongoUri);
  await User.deleteMany({ email: { $in: ['alice@example.com', 'bob@example.com'] } });
  const alice = new User({ name: 'Alice', email: 'alice@example.com', passwordHash: await bcrypt.hash('password123', 10) });
  const bob = new User({ name: 'Bob', email: 'bob@example.com', passwordHash: await bcrypt.hash('password123', 10) });
  await alice.save(); await bob.save();
  console.log('Seeded users: Alice & Bob (password: password123)');
  await mongoose.disconnect();
  process.exit(0);
})();
