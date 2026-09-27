# ticketing-app

This project was created using the [Ktor Project Generator](https://start.ktor.io).

Here are some useful links to get you started:

* [Ktor Documentation](https://ktor.io/docs/home.html)
* [Ktor GitHub page](https://github.com/ktorio/ktor)
* [Ktor Slack chat](https://app.slack.com/client/T09229ZC6/C0A974TJ9). [Request an invite](https://surveys.jetbrains.com/s3/kotlin-slack-sign-up).

## Features

Here's a list of features included in this project:

| Name | Description |
|------|-------------|

## Building & Running

To build or run the project, use one of the following tasks:

| Task | Description |
|------|-------------|

If the server starts successfully, you'll see the following output:

```
2024-12-04 14:32:45.584 [main] INFO  Application - Application started in 0.303 seconds.
2024-12-04 14:32:45.682 [main] INFO  Application - Responding at http://0.0.0.0:8080
```

## Quick Ticket desktop window

Click **Quick Ticket Widget** on the dashboard or Submit Tickets page to open a
small, resizable browser window (390 × 520). Select an issue head and sub-issue;
the Submit button appears after a sub-issue is selected. The widget uses the
current login and department, and creates a normal ticket with no extra message.
After submission it shows the ticket reference and resets for the next request.

The widget is also available at `/widget.html`. Login redirects back to it when
needed. If the browser blocks popup windows, the launcher opens the widget as a
normal page. Window positioning, minimizing, and staying on top are controlled by
the browser and operating system; this is not an installed native desktop widget.
