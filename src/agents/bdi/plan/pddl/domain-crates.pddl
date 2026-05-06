(define (domain deliveroo-crates)
    (:requirements :strips :typing)
    (:types tile crate)

    (:predicates
        (at ?t - tile)
        (adj-up    ?from - tile ?to - tile)
        (adj-down  ?from - tile ?to - tile)
        (adj-left  ?from - tile ?to - tile)
        (adj-right ?from - tile ?to - tile)
        (crate-at    ?c - crate ?t - tile)
        (crate-free  ?t - tile)
        (crate-space ?t - tile)
    )

    (:action move-up
        :parameters (?from - tile ?to - tile)
        :precondition (and (at ?from) (adj-up ?from ?to) (crate-free ?to))
        :effect (and (at ?to) (not (at ?from)))
    )
    (:action move-down
        :parameters (?from - tile ?to - tile)
        :precondition (and (at ?from) (adj-down ?from ?to) (crate-free ?to))
        :effect (and (at ?to) (not (at ?from)))
    )
    (:action move-left
        :parameters (?from - tile ?to - tile)
        :precondition (and (at ?from) (adj-left ?from ?to) (crate-free ?to))
        :effect (and (at ?to) (not (at ?from)))
    )
    (:action move-right
        :parameters (?from - tile ?to - tile)
        :precondition (and (at ?from) (adj-right ?from ?to) (crate-free ?to))
        :effect (and (at ?to) (not (at ?from)))
    )

    (:action push-up
        :parameters (?agentFrom - tile ?crateFrom - tile ?crateTo - tile ?c - crate)
        :precondition (and
            (at ?agentFrom)
            (adj-up ?agentFrom ?crateFrom)
            (adj-up ?crateFrom ?crateTo)
            (crate-at ?c ?crateFrom)
            (crate-space ?crateTo)
            (crate-free ?crateTo)
        )
        :effect (and
            (at ?crateFrom) (not (at ?agentFrom))
            (crate-at ?c ?crateTo) (not (crate-at ?c ?crateFrom))
            (crate-free ?crateFrom) (not (crate-free ?crateTo))
        )
    )
    (:action push-down
        :parameters (?agentFrom - tile ?crateFrom - tile ?crateTo - tile ?c - crate)
        :precondition (and
            (at ?agentFrom)
            (adj-down ?agentFrom ?crateFrom)
            (adj-down ?crateFrom ?crateTo)
            (crate-at ?c ?crateFrom)
            (crate-space ?crateTo)
            (crate-free ?crateTo)
        )
        :effect (and
            (at ?crateFrom) (not (at ?agentFrom))
            (crate-at ?c ?crateTo) (not (crate-at ?c ?crateFrom))
            (crate-free ?crateFrom) (not (crate-free ?crateTo))
        )
    )
    (:action push-left
        :parameters (?agentFrom - tile ?crateFrom - tile ?crateTo - tile ?c - crate)
        :precondition (and
            (at ?agentFrom)
            (adj-left ?agentFrom ?crateFrom)
            (adj-left ?crateFrom ?crateTo)
            (crate-at ?c ?crateFrom)
            (crate-space ?crateTo)
            (crate-free ?crateTo)
        )
        :effect (and
            (at ?crateFrom) (not (at ?agentFrom))
            (crate-at ?c ?crateTo) (not (crate-at ?c ?crateFrom))
            (crate-free ?crateFrom) (not (crate-free ?crateTo))
        )
    )
    (:action push-right
        :parameters (?agentFrom - tile ?crateFrom - tile ?crateTo - tile ?c - crate)
        :precondition (and
            (at ?agentFrom)
            (adj-right ?agentFrom ?crateFrom)
            (adj-right ?crateFrom ?crateTo)
            (crate-at ?c ?crateFrom)
            (crate-space ?crateTo)
            (crate-free ?crateTo)
        )
        :effect (and
            (at ?crateFrom) (not (at ?agentFrom))
            (crate-at ?c ?crateTo) (not (crate-at ?c ?crateFrom))
            (crate-free ?crateFrom) (not (crate-free ?crateTo))
        )
    )
)
