import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
const mongoUri = process.env.MONGODB_URI || 'mongodb://mongo:27017/todo';
const taskSchema = new mongoose.Schema({ title: String, description: String, status: String, ownerId: String }, { timestamps: true });
const Task = mongoose.model('Task', taskSchema);

(async () => {
  await mongoose.connect(mongoUri);
  // Just a placeholder; tasks are user-scoped so seeding happens after login in the UI.
  console.log('Task service ready. Create tasks via UI or API.');
  await mongoose.disconnect();
  process.exit(0);
})();
