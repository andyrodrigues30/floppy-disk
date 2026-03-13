export interface PairingOffer {
    type: "PAIR_OFFER"
    offer: RTCSessionDescriptionInit
}

export interface PairingAnswer {
    type: "PAIR_ANSWER"
    answer: RTCSessionDescriptionInit
}