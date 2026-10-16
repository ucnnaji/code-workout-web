# PracticeBridge

**An Interactive Programming Practice and Learning Platform**

PracticeBridge is a web-based platform designed to support programming education through interactive coding activities, automated feedback, and structured learning experiences.

The platform provides an environment where learners can write, execute, debug, and explain code while receiving feedback to support their understanding of programming concepts.

PracticeBridge supports **Python** and **Java** and can be deployed in educational settings.

## Features

- **Interactive code editor:** Syntax highlighting, line numbers, indentation, bracket matching, undo/redo, and code formatting.
- **Python and Java support:** Practice programming in either supported language.
- **Code execution:** Run code in a sandboxed environment and inspect output.
- **AI-assisted feedback:** Receive automated guidance during programming practice.
- **Debugging practice:** Find and correct errors in existing programs.
- **Code explanation:** Strengthen comprehension by describing what code does.
- **Progress tracking:** Continue learning activities across sessions.
- **Administrative interface:** Manage operational settings and platform activity.

## Technology Stack

| Technology | Purpose |
| --- | --- |
| Node.js | Server-side JavaScript runtime |
| Express.js | Web application framework |
| Supabase | Database and application services |
| OpenAI API | AI-assisted feedback |
| Judge0 | Sandboxed code execution |
| Render | Cloud hosting and deployment |
| GitHub | Source control and collaboration |

## Getting Started

### Prerequisites

- Node.js and npm
- Git
- A configured Supabase project
- Credentials for any enabled external services

### Local Installation

1. Clone your repository and enter the project directory:

   ```bash
   git clone https://github.com/YOUR_USERNAME/practicebridge.git
   cd practicebridge
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root and set the environment variables required by your deployment. Keep this file out of version control.

4. Set up the database using the migration scripts supplied with the repository.

5. Start the application:

   ```bash
   npm start
   ```

Open the local URL configured for the application.

## How PracticeBridge Works

PracticeBridge brings several programming activities into one interface:

- **Write and run code:** Develop programs, execute them, and inspect results.
- **Debug programs:** Explore existing code, identify errors, and improve implementations.
- **Explain code:** Read examples and describe their behavior in plain language.
- **Review feedback:** Use automated guidance to refine understanding and solutions.

Available activities may depend on the deployment configuration.

## Testing

Run the automated test suite:

```bash
npm test
```

Run build verification:

```bash
npm run build:verify
```

Additional checks:

```bash
npm run test:security
npm run test:load
```

These checks support development but do not replace validation of a production deployment.

## Deployment

PracticeBridge supports cloud deployment with **Render** and **Supabase**.

1. Configure the Supabase project and apply the appropriate database migrations.
2. Add required environment variables securely in the deployment environment.
3. Connect the GitHub repository to Render.
4. Deploy the application and confirm that its health checks pass.
5. Verify the application in the deployed environment before making it available to users.

## Security and Privacy

- Keep API keys, database credentials, and administrative secrets in environment variables.
- Never commit `.env` files or private data to the repository.
- Use an appropriately secured code-execution service.
- Follow applicable institutional and organizational requirements for data handling.

## Project Status

**Active development.** Features and documentation may evolve as the platform improves.

## Intended Use

PracticeBridge is designed for programming education, instructional development, and related academic applications.

## License

All rights reserved unless a separate license is provided by the repository maintainers.

---

*PracticeBridge | Interactive programming practice and feedback.*
