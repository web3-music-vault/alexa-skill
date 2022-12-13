/* *
 * This sample demonstrates handling intents for an Alexa skill implementing the AudioPlayer interface using the Alexa Skills Kit SDK (v2).
 * This sample works using the default DynamoDB table associated with an Alexa-hosted skill - you will need to use this with a hosted skill,
 * or you use your own DynamoDB table in the request and response interceptors.
 * Please visit https://github.com/alexa-samples for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
var https = require('https'); 
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');
const Util = require('./util.js');
const httpsGet = require('./httpsGet')

// LATER message for new songs added?

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const audioData = await getAudioData(handlerInput)
        let message;
        let reprompt;
        // TODO handle loading user data using credentials
        // TODO handle case when user doesn't have account linked
        // TODO handle playing a playlist where data loads from linked account service
        if( playbackInfo.needsMusic){
            console.log('needsMusic')
             message = "GM You must link your account with Web3 Music Vault to continue.";                
             return handlerInput.responseBuilder
             .speak(message)
             .withLinkAccountCard()
             .getResponse();
        }
        if (!playbackInfo.hasPreviousPlaybackSession) {
            message = 'GM from the Web3 Music Vault. you can ask to play my NFT music to play your ' + audioData.length  + ' NFT songs.';
            reprompt = 'You can say, play my NFT music, to begin.';
        } else {
            playbackInfo.inPlaybackSession = false;
            message = `You were listening to ${audioData[playbackInfo.playOrder[playbackInfo.index]].title}. Would you like to resume?`;
            reprompt = 'You can say yes to resume or no to play from the beginning.';
        }

        return handlerInput.responseBuilder
            .speak(message)
            .reprompt(reprompt)
            .getResponse();
    },
};

/**
 * Intent handler to check if the device supports the AudioPlayer interface.
 * */
const CheckAudioInterfaceHandler = {
    async canHandle(handlerInput) {
        const audioPlayerInterface = ((((handlerInput.requestEnvelope.context || {}).System || {}).device || {}).supportedInterfaces || {}).AudioPlayer;
        return audioPlayerInterface === undefined
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('Sorry, this skill is not supported on this device')
            .withShouldEndSession(true)
            .getResponse();
    },
};

/**
 * Intent handler to start playing an audio file.
 * By default, it will play a specific audio stream.
 * */
const StartPlaybackHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        
       if( playbackInfo.needsMusic){
        console.log('needsMusic')
        let message = "GM! You must link your account with Web3 Music Vault to continue.";                
         return handlerInput.responseBuilder
         .speak(message)
         .withLinkAccountCard()
         .getResponse();
        }
        
        const request = handlerInput.requestEnvelope.request;

        if (!playbackInfo.inPlaybackSession) {
            return request.type === 'IntentRequest' && request.intent.name === 'PlayAudio';
        }
        if (request.type === 'PlaybackController.PlayCommandIssued') {
            return true;
        }

        if (request.type === 'IntentRequest') {
            return request.intent.name === 'PlayAudio' ||
                request.intent.name === 'AMAZON.ResumeIntent';
        }
    },
    async handle(handlerInput) {
        const audioData = await getAudioData(handlerInput)

        if (audioData.length < 1) {
            // if not connected then ask for account linking in Alexa app
             let message = "GM! You must link your account and unlock your music with the Web3 Music Vault webapp to continue.";                
             return handlerInput.responseBuilder
                .speak(message)
                .withLinkAccountCard()
                .getResponse();
        }
        
        return controller.play(handlerInput);
    },
};

/**
 * Intent handler to play the next track in the playlist.
 * */
const NextPlaybackHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return playbackInfo.inPlaybackSession &&
            (request.type === 'PlaybackController.NextCommandIssued' ||
                (request.type === 'IntentRequest' && request.intent.name === 'AMAZON.NextIntent'));
    },
    handle(handlerInput) {
        return controller.playNext(handlerInput);
    },
};

/**
 * Intent handler to play the previous track in the playlist.
 * */
const PreviousPlaybackHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return playbackInfo.inPlaybackSession &&
            (request.type === 'PlaybackController.PreviousCommandIssued' ||
                (request.type === 'IntentRequest' && request.intent.name === 'AMAZON.PreviousIntent'));
    },
    handle(handlerInput) {
        return controller.playPrevious(handlerInput);
    },
};

/**
 * Intent handler to pause the audio.
 * */
const PausePlaybackHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            (request.intent.name === 'AMAZON.StopIntent' ||
                request.intent.name === 'AMAZON.CancelIntent' ||
                request.intent.name === 'AMAZON.PauseIntent');
    },
    handle(handlerInput) {
        return controller.stop(handlerInput);
    },
};

/**
 * Intent handler to turn on looping.
 * */
const LoopOnHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.LoopOnIntent';
    },
    async handle(handlerInput) {
        const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        const playbackSetting = await persistentAttributes.playbackSetting;
        playbackSetting.loop = true;

        return handlerInput.responseBuilder
            .speak('Loop turned on.')
            .getResponse();
    },
};

/**
 * Intent handler to turn off looping.
 * */
const LoopOffHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.LoopOffIntent';
    },
    async handle(handlerInput) {
        const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        const playbackSetting = await persistentAttributes.playbackSetting;
        playbackSetting.loop = false;

        return handlerInput.responseBuilder
            .speak('Loop turned off.')
            .getResponse();
    },
};

/**
 * Intent handler to turn on shuffle.
 * */
const ShuffleOnHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.ShuffleOnIntent';
    },
    async handle(handlerInput) {
        const audioData = await getAudioData(handlerInput)

        const {
            playbackInfo,
            playbackSetting,
        } = await handlerInput.attributesManager.getPersistentAttributes();

        playbackSetting.shuffle = true;
        playbackInfo.playOrder = await shuffleOrder(audioData);
        playbackInfo.index = 0;
        playbackInfo.offsetInMilliseconds = 0;
        playbackInfo.playbackIndexChanged = true;
        return handlerInput.responseBuilder
            .speak('Shuffle turned on.')
            .getResponse();
    },
};

/**
 * Intent handler to turn off shuffle.
 * */
const ShuffleOffHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.ShuffleOffIntent';
    },
    async handle(handlerInput) {
        const audioData = await getAudioData(handlerInput)

        const {
            playbackInfo,
            playbackSetting,
        } = await handlerInput.attributesManager.getPersistentAttributes();

        if (playbackSetting.shuffle) {
            playbackSetting.shuffle = false;
            playbackInfo.index = playbackInfo.playOrder[playbackInfo.index];
            playbackInfo.playOrder = [...Array(audioData.length).keys()];
        }

        return handlerInput.responseBuilder
            .speak('Shuffle turned off.')
            .getResponse();
    },
};

/**
 * Intent handler to start playing the track from the beginning.
 * */
const StartOverHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.StartOverIntent';
    },
    async handle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);

        playbackInfo.offsetInMilliseconds = 0;

        return controller.play(handlerInput);
    },
};

const YesHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return !playbackInfo.inPlaybackSession && request.type === 'IntentRequest' && request.intent.name === 'AMAZON.YesIntent';
    },
    handle(handlerInput) {
        return controller.play(handlerInput);
    },
};

const NoHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return !playbackInfo.inPlaybackSession && request.type === 'IntentRequest' && request.intent.name === 'AMAZON.NoIntent';
    },
    async handle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);

        playbackInfo.index = 0;
        playbackInfo.offsetInMilliseconds = 0;
        playbackInfo.playbackIndexChanged = true;
        playbackInfo.hasPreviousPlaybackSession = false;

        return controller.play(handlerInput);
    },
};
/**
 * Intent handler for help utterances, changes the response based on the current playback state.
 * */
const HelpHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
    },
    async handle(handlerInput) {
        const audioData = await getAudioData(handlerInput)
        const playbackInfo = await getPlaybackInfo(handlerInput);
        let message;

        if (!playbackInfo.hasPreviousPlaybackSession) {
            message = 'GM to the Web3 Music Vault. you can ask to play your NFT music to begin the music.';
        } else if (!playbackInfo.inPlaybackSession) {
            message = `You were listening to ${audioData[playbackInfo.index].title}. Would you like to resume?`;
        } else {
            message = 'GM to the Web3 Music Vault. You can say, Next or Previous to navigate through the playlist. At any time, you can say Pause to pause the audio and Resume to resume.';
        }

        return handlerInput.responseBuilder
            .speak(message)
            .reprompt(message)
            .getResponse();
    },
};

const ExitHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;


        return !playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            (request.intent.name === 'AMAZON.StopIntent' ||
                request.intent.name === 'AMAZON.CancelIntent');
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('Goodbye!')
            .getResponse();
    },
};

/* *
 * AudioPlayer events can be triggered when users interact with your audio playback, such as stopping and 
 * starting the audio, as well as when playback is about to finish playing or playback fails.
 * This handler will save the appropriate details for each event and log the details of the exception,
 * which can help troubleshoot issues with audio playback.
 * */
const AudioPlayerEventHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type.startsWith('AudioPlayer.');
    },
    async handle(handlerInput) {
        const audioData = await getAudioData(handlerInput)
        const {
            requestEnvelope,
            attributesManager,
            responseBuilder
        } = handlerInput;
        const audioPlayerEventName = requestEnvelope.request.type.split('.')[1];
        const {
            playbackSetting,
            playbackInfo
        } = await attributesManager.getPersistentAttributes();

        switch (audioPlayerEventName) {
            case 'PlaybackStarted':
                playbackInfo.token = getToken(handlerInput);
                playbackInfo.index = await getIndex(handlerInput);
                playbackInfo.inPlaybackSession = true;
                playbackInfo.hasPreviousPlaybackSession = true;
                break;
            case 'PlaybackFinished':
                playbackInfo.inPlaybackSession = false;
                playbackInfo.hasPreviousPlaybackSession = false;
                playbackInfo.nextStreamEnqueued = false;
                break;
            case 'PlaybackStopped':
                playbackInfo.token = getToken(handlerInput);
                playbackInfo.index = await getIndex(handlerInput);
                playbackInfo.offsetInMilliseconds = getOffsetInMilliseconds(handlerInput);
                break;
            case 'PlaybackNearlyFinished': {
                if (playbackInfo.nextStreamEnqueued) {
                    break;
                }

                const enqueueIndex = (playbackInfo.index + 1) % audioData.length;

                if (enqueueIndex === 0 && !playbackSetting.loop) {
                    break;
                }

                playbackInfo.nextStreamEnqueued = true;

                const enqueueToken = playbackInfo.playOrder[enqueueIndex];
                const playBehavior = 'ENQUEUE';
                const track = audioData[playbackInfo.playOrder[enqueueIndex]];
                const expectedPreviousToken = playbackInfo.token;
                const offsetInMilliseconds = 0;

                console.log('track', track.url, 'offsetInMilliseconds', offsetInMilliseconds, 'expectedPreviousToken', expectedPreviousToken, 'playBehavior', playBehavior)
                responseBuilder.addAudioPlayerPlayDirective(
                    playBehavior,
                    track.url,
                    enqueueToken,
                    offsetInMilliseconds,
                    expectedPreviousToken,
                );
                break;
            }
            case 'PlaybackFailed':
                playbackInfo.inPlaybackSession = false;
                console.log(`~~~~ Playback Failed : ${handlerInput.requestEnvelope.request.error}`);
                return;
            default:
                throw new Error('Should never reach here!');
        }

        return responseBuilder.getResponse();
    },
};


/* *
 * SystemExceptions can be triggered if there is a problem with the audio that is trying to be played.
 * This handler will log the details of the exception and can help troubleshoot issues with audio playback.
 * */
const SystemExceptionHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'System.ExceptionEncountered';
    },
    handle(handlerInput) {
        console.log(`~~~~ System exception encountered: ${JSON.stringify(handlerInput.requestEnvelope.request)}`);
    },
};

/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Sorry, I had trouble doing what you asked. Please try again.';
        const repropt = "Sorry, I could not handle your last request, can you please rephrase your request?"
        console.log(`~~~~ Error handled: ${JSON.stringify(handlerInput)}`);
        // Log Error
        console.log("==== ERROR ======");
        console.log(error);
        return handlerInput.responseBuilåder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/* HELPER FUNCTIONS */
/**
 * Helper function to retrieve information on the playback state from persistent attributes
 * */
async function getPlaybackInfo(handlerInput) {
    const attributes = await handlerInput.attributesManager.getPersistentAttributes();
    return attributes.playbackInfo;
}

/**
 * Helper function to retrieve information on the active playlist from persistent attributes
 * */
async function getAudioData(handlerInput) {
    const attributes = await handlerInput.attributesManager.getPersistentAttributes();
    return attributes.audioData;
}


/**
 * Helper function that handles all of the playback including play, stop, play next and play previous
 * */
const controller = {
    async play(handlerInput) {
        const audioData = await getAudioData(handlerInput)
        const {
            attributesManager,
            responseBuilder
        } = handlerInput;

        const playbackInfo = await getPlaybackInfo(handlerInput);
        const {
            playOrder,
            offsetInMilliseconds,
            index
        } = playbackInfo;
        
        let startSongAtOffset = offsetInMilliseconds

        const playBehavior = 'REPLACE_ALL';
        const track = audioData[playOrder[index]];
        const token = playOrder[index];
        playbackInfo.nextStreamEnqueued = false;

        let audioItemMetadata = {
            "title": track.title
        };

        if (handlerInput.requestEnvelope.request.type.startsWith('PlaybackController.')) {
            console.log('track', track.url, 'startSongAtOffset', startSongAtOffset, 'playBehavior', playBehavior, 'token', token, 'audioItemMetadata', audioItemMetadata)
            responseBuilder
                .withShouldEndSession(true)
                .addAudioPlayerPlayDirective(playBehavior, track.url, token, startSongAtOffset, null, audioItemMetadata);
            return responseBuilder.getResponse();
        }
        
        let speech = "";
        if (playbackInfo.hasPreviousPlaybackSession) {
            speech = `This is ${track.title}.`;
        } else {
            if(track.title && track.collection && track.collection !== track.title){
                speech = `Starting from the beginning. This is ${track.title} from ${track.collection} collection.`
                startSongAtOffset = 0
            }else if(track.title){
               speech = `Starting from the beginning. This is ${track.title}.`;
               startSongAtOffset = 0
            }
            
        }
        console.log('track', track.url, 'startSongAtOffset', startSongAtOffset, 'playBehavior', playBehavior, 'token', token, 'audioItemMetadata', audioItemMetadata)

        responseBuilder
            .speak(speech)
            .withShouldEndSession(true)
            .addAudioPlayerPlayDirective(playBehavior, track.url, token, startSongAtOffset, null, audioItemMetadata);

        return responseBuilder.getResponse();
    },
    stop(handlerInput) {
        return handlerInput.responseBuilder
            .addAudioPlayerStopDirective()
            .getResponse();
    },
    async playNext(handlerInput) {
        const audioData = await getAudioData(handlerInput)
        const {
            playbackInfo,
            playbackSetting,
        } = await handlerInput.attributesManager.getPersistentAttributes();

        const nextIndex = (playbackInfo.index + 1) % audioData.length;

        if (nextIndex === 0 && !playbackSetting.loop) {
            return handlerInput.responseBuilder
                .speak('You have reached the end of the playlist.')
                .addAudioPlayerStopDirective()
                .getResponse();
        }

        playbackInfo.index = nextIndex;
        playbackInfo.offsetInMilliseconds = 0;
        playbackInfo.playbackIndexChanged = true;

        return this.play(handlerInput);
    },
    async playPrevious(handlerInput) {
        const audioData = await getAudioData(handlerInput)
        const {
            playbackInfo,
            playbackSetting,
        } = await handlerInput.attributesManager.getPersistentAttributes();

        let previousIndex = playbackInfo.index - 1;

        if (previousIndex === -1) {
            if (playbackSetting.loop) {
                previousIndex += audioData.length;
            } else {
                return handlerInput.responseBuilder
                    .speak('You have reached the start of the playlist')
                    .addAudioPlayerStopDirective()
                    .getResponse();
            }
        }

        playbackInfo.index = previousIndex;
        playbackInfo.offsetInMilliseconds = 0;
        playbackInfo.playbackIndexChanged = true;

        return this.play(handlerInput);
    },
};

// Extracting token received in the request.
function getToken(handlerInput) {
    
    return handlerInput.requestEnvelope.request.token;
}

// Extracting index from the token received in the request.
async function getIndex(handlerInput) {
    
    const tokenValue = parseInt(handlerInput.requestEnvelope.request.token, 10);
    const attributes = await handlerInput.attributesManager.getPersistentAttributes();

    return attributes.playbackInfo.playOrder.indexOf(tokenValue);
}

// Extracting offsetInMilliseconds received in the request.
function getOffsetInMilliseconds(handlerInput) {
    return handlerInput.requestEnvelope.request.offsetInMilliseconds;
}

// Shuffle the order of files in the array.
function shuffleOrder(audioData) {
    const array = [...Array(audioData.length).keys()];
    let currentIndex = array.length;
    let temp;
    let randomIndex;
    return new Promise((resolve) => {
        while (currentIndex >= 1) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temp = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temp;
        }
        resolve(array);
    });
}

// Request and response interceptors using the DynamoDB table associated with Alexa-hosted skills

const LoadPersistentAttributesRequestInterceptor = {
    async process(handlerInput) {

        const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
         // get the access token from the context
        var accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;      
        console.log('accessToken', accessToken)
        // Log all requests for troubleshooting
        console.log(`~~~~Request: ${JSON.stringify(handlerInput)}`);
        let needsMusic = false

        if(!accessToken){
            // what to do when no music?
            needsMusic = true;
        }
        
        console.log('playbackInfo.index',  persistentAttributes.playbackInfo &&  persistentAttributes.playbackInfo.index)
    
    //   let reset = false;
    //   if(persistentAttributes.playbackInfo && persistentAttributes.playbackInfo.index > audioData.length){
    //       reset = true
    //   }
       
       console.log('~~~~ request finished')
        
        // Check if user is invoking the skill the first time and initialize preset values
        if (Object.keys(persistentAttributes).length === 0 ||
                persistentAttributes.playbackInfo.playOrder.length === 0) {
                    
            let audioData = [];
            if(accessToken){
                const result = await httpsGet(accessToken)
                audioData = result.content
                console.log('audioData.length', audioData.length)
            }
      
            handlerInput.attributesManager.setPersistentAttributes({
                playbackSetting: {
                    loop: false,
                    shuffle: false,
                },
                audioData: audioData,
                playbackInfo: {
                    needsMusic: needsMusic,
                    playOrder: [...Array(audioData.length).keys()],
                    index: 0,
                    offsetInMilliseconds: 0,
                    playbackIndexChanged: true,
                    token: '',
                    nextStreamEnqueued: false,
                    inPlaybackSession: false,
                    hasPreviousPlaybackSession: false,
                },
            });
        }
    },
};

const SavePersistentAttributesResponseInterceptor = {
    async process(handlerInput) {
        await handlerInput.attributesManager.savePersistentAttributes();
    },
};

const RefreshHandler = {
    async canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
            (request.intent.name === 'ReloadSongs');
    },
    async handle(handlerInput) {
        const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        
        console.log('accessToken', accessToken)
        
       

        let needsMusic = false
        if(!accessToken){
            needsMusic = true
            console.log('needsMusic')
             const message = "GM You must link your account with Web3 Music Vault to continue.";                
             return handlerInput.responseBuilder
             .speak(message)
             .withLinkAccountCard()
             .getResponse();        
        }

        const result = await httpsGet(accessToken)
        const audioData = result.content;
        persistentAttributes.audioData = audioData;
        
        
        handlerInput.attributesManager.setPersistentAttributes({
        playbackSetting: {
            loop: false,
            shuffle: false,
        },
        audioData: audioData,
        playbackInfo: {
            needsMusic: needsMusic,
            playOrder: [...Array(audioData.length).keys()],
            index: 0,
            offsetInMilliseconds: 0,
            playbackIndexChanged: true,
            token: '',
            nextStreamEnqueued: false,
            inPlaybackSession: false,
            hasPreviousPlaybackSession: false,
        },
    });
        
        return handlerInput.responseBuilder
            .speak('Reloaded your Music!')
            .getResponse();
    },
};



/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        CheckAudioInterfaceHandler,
        LaunchRequestHandler,
        HelpHandler,
        SystemExceptionHandler,
        SessionEndedRequestHandler,
        YesHandler,
        NoHandler,
        StartPlaybackHandler,
        NextPlaybackHandler,
        PreviousPlaybackHandler,
        PausePlaybackHandler,
        LoopOnHandler,
        LoopOffHandler,
        ShuffleOnHandler,
        ShuffleOffHandler,
        StartOverHandler,
        ExitHandler,
        AudioPlayerEventHandler,
        FallbackIntentHandler,
        RefreshHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .addRequestInterceptors(LoadPersistentAttributesRequestInterceptor)
    .addResponseInterceptors(SavePersistentAttributesResponseInterceptor)
    .withCustomUserAgent('sample/multistreamaudioplayer-nodejs/v2.0')
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({
                apiVersion: 'latest',
                region: process.env.DYNAMODB_PERSISTENCE_REGION
            })
        })
    )
    .lambda();