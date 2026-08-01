export const sendPushNotification = async (event, targetUserId, title, message) => {
  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event,
        targetExternalId: targetUserId,
        title,
        message
      })
    });

    if (!response.ok) {
      console.error('Push notification request failed:', response.status);
      throw new Error(`notify responded with status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return null;
  }
};
