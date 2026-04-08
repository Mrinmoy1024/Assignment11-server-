const express = require("express");
const app = express();
const port = 3000;
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  }),
);

app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Invalid token" });
    }

    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    const db = client.db("contest");
    const contestCollection = db.collection("contest");
    const usersCollection = db.collection("users");
    const leaderboardCollection = db.collection("leaderboard");
    const submissionsCollection = db.collection("submissions");

    app.get("/contest", async (req, res) => {
      const result = await contestCollection.find().toArray();
      res.send(result);
    });

    app.get("/users", verifyJWT, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/leaderboard", async (req, res) => {
      const result = await leaderboardCollection
        .find()
        .sort({ rank: 1 })
        .toArray();
      res.send(result);
    });

    app.get("/recent-winners", async (req, res) => {
      const result = await leaderboardCollection
        .find()
        .sort({ rank: 1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const { name, email, photoURL } = req.body;

      if (!name || !email) {
        return res
          .status(400)
          .json({ message: "Name and email are required." });
      }

      try {
        const existing = await usersCollection.findOne({ email });

        if (existing) {
          return res.status(409).json({ message: "User already exists" });
        }

        const result = await usersCollection.insertOne({
          name,
          email,
          photoURL: photoURL || "",
          role: "general user",
          createdAt: new Date(),
        });

        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/jwt", (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "100d",
      });

      res.send({ token });
    });
    app.get("/users/check", async (req, res) => {
      const { email } = req.query;
      const existing = await usersCollection.findOne({ email });
      if (existing)
        return res.status(409).json({ message: "Email already exists" });
      res.status(200).json({ available: true });
    });

    console.log("MongoDB connected");
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server running...");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
