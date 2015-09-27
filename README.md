# js-message
Normalized JS & JSON Message and event Protocol for node.js, react.js, websockets, rest api's, node-ipc, and any other protocol that might use a js object and or a JSON string.  

js-message allows for seamless conversion of JSON messages and events to JS objects for a normalized implementation on the server and in the client without needing to concern yourself with JSON intermediaries and custom parsers.  

Things are just easier when you normalize them.  


|method or key  |type   |mutable|description|
|---------------|-------|-------|-----------|
|type           |String |true   |the type of message|
|data           |Object |true   |the message data or payload|
|load           |func   |false  |load a message from JSON, this will return a message with the type of error if not valid JSON|
|JSON           |String |not by user|JSON representation of the message|

### Creating a Message Object

```javascript

    var Message=require('js-message');

    var myMessage=new Message;
    myMessage.type='message or event type';
    myMessage.data.something='something';
    myMessage.data.stuff=[1,2,3,4,5]

    console.log(myMessage.JSON);

```

### Creating a Message From JSON

```javascript

    var Message=require('js-message');

    //lets say we have the above example running on
    //a websocket server sending js-messages as JSON
    //
    //and lets say this is the client in the browser
    ws.on(
        'message',
        handleMessage
    );

    handleMessage(e){
        var message=new Message;
        message.load(e.data);

        console.log(message.type, message.data);
    }

```

### Sending a Message Object via WebSocket

```javascript

    var Message=require('js-message');

    //client example, but works the same on server too!
    var ws=new WebSocket('ws://myawesomeWS:8000');

    var myMessage=new Message;
    myMessage.type='setUsername';
    myMessage.data.username='sideshow bob';

    ws.send(myMessage.JSON);

```


---

This work is licenced via the [DBAD Public Licence](http://www.dbad-license.org/).
