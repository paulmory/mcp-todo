# Roadmap

This roadmap tracks planned improvements for MCP-ToDo. Items are proposals and are not implemented unless marked complete.

## Planned

### System task reminders

- Add configurable reminders for tasks with a due date and time. Start with a five-minute-before default and allow users to change or disable it.
- Deliver native desktop notifications on Windows and macOS, including when the web interface is closed.
- Add a small background reminder worker that reads the existing SQLite database and starts with the user's session (Windows Task Scheduler and macOS `launchd`). Keep it separate from the MCP stdio process so reminders do not depend on an MCP client staying connected.
- Track reminder delivery in SQLite to avoid duplicate notifications, and define behavior for tasks edited, completed, deferred, deleted, or missed while the computer was asleep.
- Add notification preferences and permission/setup guidance to the web interface.
- Keep task data and reminder delivery local; do not require a hosted push service.

### External shared storage

- Provide an optional external shared storage service, with a Docker Compose deployment as one supported setup.
- Authenticate clients with an explicit access key; support key rotation and keep secrets out of source control and logs.
- Sync task data through an authenticated API instead of sharing the SQLite database file over the network.
- Define encryption in transit, backup and restore procedures, and conflict handling for changes made on multiple devices.
- Keep local-only mode available for users who do not want external synchronization.

### System calendar integration

- Explore connecting tasks with the user's system calendar on Windows and macOS.
- Support creating calendar events from tasks with due dates and times, and keep event updates and removals consistent when tasks change.
- Let users choose the target calendar and grant access explicitly; prevent duplicate events and document platform-specific permissions.
- Decide whether synchronization should be one-way or bidirectional before implementation, and define conflict handling.

## Later

- Consider optional browser notifications while the web interface is open as a lightweight fallback.
- Document installation, startup, permissions, troubleshooting, and platform limitations for the reminder worker.
