export class Message {
    constructor() {
    
    }

    type=''
    data={}

    get JSON() {
        return JSON.stringify(
            {
                type: this.type,
                data: this.data
            }
        );
    }

    load(message) {
        try {
            const parsedMessage = JSON.parse(message);
            this.type = parsedMessage.type;
            this.data = parsedMessage.data;
        } catch (err) {
            const badMessage = message;
            this.type = 'error';
            this.data = {
                message: 'Invalid JSON response format',
                err: err,
                response: badMessage
            };
        }
    }
}

export default Message;