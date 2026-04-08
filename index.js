const express = require("express");
const app = express();
const port = 3000;
const cors = require("cors");
require("dotenv").config();

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
    optionSuccessStatus: 200,
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

async function run() {
  try {
    const db = client.db("contest");
    const contestCollection = db.collection("contest");
    const usersCollection = db.collection("users");
    const leaderboardCollection = db.collection("leaderboard");

    app.get("/contest", async (req, res) => {
      const result = await contestCollection.find().toArray();
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/leaderboard", async (req, res) => {
      try {
        const leaderboardData = await leaderboardCollection
          .find()
          .sort({ rank: 1 })
          .toArray();
        res.json(leaderboardData);
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
        res.status(500).json({ error: "Failed to fetch leaderboard" });
      }
    });
    app.get("/recent-winners", async (req, res) => {
      try {
        const result = await leaderboardCollection
          .find()
          .sort({ rank: 1 })
          .limit(6)
          .toArray();
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch recent winners" });
      }
    });
    app.post("/users", async (req, res) => {
      const { name, email, photoURL, createdAt } = req.body;

      if (!name || !email) {
        return res
          .status(400)
          .json({ message: "Name and email are required." });
      }

      try {
        const existing = await usersCollection.findOne({ email });

        if (existing) {
          return res
            .status(409)
            .json({ message: "An account with this email already exists." });
        }

        const result = await usersCollection.insertOne({
          name,
          email,
          photoURL: photoURL || "",
          createdAt: createdAt ? new Date(createdAt) : new Date(),
        });

        res.status(201).json({
          message: "User created successfully.",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Internal server error." });
      }
    });
    console.log("Successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
