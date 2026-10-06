import express from "express";
import cors from "cors"; // used to connect from another frontend link
import "dotenv/config";
import connectDB from "./config/db.js";
import authRouter from "./routes/authRoutes.js";

connectDB();

const app = express();

app.use(cors());
app.use(express.json());


app.get('/', (req, res) => res.send("Server is running"))
app.use("/api/auth", authRouter)

const PORT = process.env.PORT || 5000;

app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`))
