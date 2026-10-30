const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'hackathon_user',
  password: process.env.DB_PASSWORD || 'hackathon_password',
  database: process.env.DB_NAME || 'hackathon',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;
let isDbReady = false;

// Connect to Database with Retry logic (up to 30 attempts, 3s apart)
async function initializeDatabase() {
  const maxRetries = 30;
  const retryInterval = 3000; // 3 seconds

  console.log(`Connecting to database at ${dbConfig.host}:${dbConfig.port} as user '${dbConfig.user}'...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Attempt ${attempt}/${maxRetries}] Checking database connection...`);
      
      pool = mysql.createPool(dbConfig);
      
      // Test the connection
      const connection = await pool.getConnection();
      console.log('Database connection established successfully.');

      // Create "teams" table if it doesn't exist
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS teams (
          id INT AUTO_INCREMENT PRIMARY KEY,
          team_name VARCHAR(255) NOT NULL,
          members TEXT NOT NULL,
          project_idea TEXT NOT NULL,
          registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `;
      
      await connection.query(createTableQuery);
      console.log('Table "teams" verified/created successfully.');
      connection.release();

      isDbReady = true;
      return;
    } catch (err) {
      console.error(`Database connection attempt ${attempt} failed: ${err.message}`);
      if (pool) {
        try {
          await pool.end();
        } catch (_) {}
        pool = null;
      }
      
      if (attempt < maxRetries) {
        console.log(`Retrying in ${retryInterval / 1000} seconds...`);
        await new Promise((res) => setTimeout(res, retryInterval));
      } else {
        console.error('Exhausted all database connection retries. Server starting in degraded state.');
      }
    }
  }
}

// Routes

// 1. Health check endpoint (Used by Kubernetes probes)
app.get('/api/health', async (req, res) => {
  if (!isDbReady || !pool) {
    return res.status(503).json({
      status: 'error',
      message: 'Database connection not ready'
    });
  }

  try {
    const [rows] = await pool.query('SELECT 1 AS health');
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Database query failed',
      error: error.message
    });
  }
});

// 2. GET all registered teams
app.get('/api/teams', async (req, res) => {
  if (!isDbReady || !pool) {
    return res.status(503).json({ error: 'Database is not ready yet' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, team_name, members, project_idea, registered_at FROM teams ORDER BY registered_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to retrieve teams' });
  }
});

// 3. POST register a new team
app.post('/api/teams', async (req, res) => {
  if (!isDbReady || !pool) {
    return res.status(503).json({ error: 'Database is not ready yet' });
  }

  const { team_name, members, project_idea } = req.body;

  if (!team_name || !members || !project_idea) {
    return res.status(400).json({
      error: 'All fields are required: team_name, members, project_idea'
    });
  }

  try {
    const query = `
      INSERT INTO teams (team_name, members, project_idea)
      VALUES (?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      team_name.trim(),
      members.trim(),
      project_idea.trim()
    ]);

    const newTeam = {
      id: result.insertId,
      team_name: team_name.trim(),
      members: members.trim(),
      project_idea: project_idea.trim(),
      registered_at: new Date()
    };

    res.status(201).json({
      message: 'Team registered successfully',
      team: newTeam
    });
  } catch (error) {
    console.error('Error registering team:', error);
    res.status(500).json({ error: 'Failed to register team' });
  }
});

// 4. DELETE a team by ID
app.delete('/api/teams/:id', async (req, res) => {
  if (!isDbReady || !pool) {
    return res.status(503).json({ error: 'Database is not ready yet' });
  }

  const teamId = parseInt(req.params.id, 10);
  if (isNaN(teamId)) {
    return res.status(400).json({ error: 'Invalid team ID' });
  }

  try {
    const [result] = await pool.query('DELETE FROM teams WHERE id = ?', [teamId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json({ message: 'Team deleted successfully', id: teamId });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// Start the server and initiate DB connection
const server = app.listen(PORT, async () => {
  console.log(`Backend server running on port ${PORT}`);
  await initializeDatabase();
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down backend server...');
  server.close(async () => {
    if (pool) {
      await pool.end();
      console.log('Database pool closed.');
    }
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

