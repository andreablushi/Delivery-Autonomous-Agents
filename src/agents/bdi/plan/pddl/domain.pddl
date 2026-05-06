(define (domain deliveroo)

    (:requirements :strips :typing)

    (:types tile parcel)

    (:predicates
        (at ?t - tile)
        (parcel ?p - parcel ?t - tile)
        (holding ?p - parcel)
        (delivery ?t - tile)
        (adj-up    ?from - tile ?to - tile)
        (adj-down  ?from - tile ?to - tile)
        (adj-left  ?from - tile ?to - tile)
        (adj-right ?from - tile ?to - tile)
    )

    (:action move-up
        :parameters (?from - tile ?to - tile)
        :precondition (and (at ?from) (adj-up ?from ?to))
        :effect (and (at ?to) (not (at ?from)))
    )

    (:action move-down
        :parameters (?from - tile ?to - tile)
        :precondition (and (at ?from) (adj-down ?from ?to))
        :effect (and (at ?to) (not (at ?from)))
    )

    (:action move-left
        :parameters (?from - tile ?to - tile)
        :precondition (and (at ?from) (adj-left ?from ?to))
        :effect (and (at ?to) (not (at ?from)))
    )

    (:action move-right
        :parameters (?from - tile ?to - tile)
        :precondition (and (at ?from) (adj-right ?from ?to))
        :effect (and (at ?to) (not (at ?from)))
    )

    (:action pickup
        :parameters (?p - parcel ?t - tile)
        :precondition (and (at ?t) (parcel ?p ?t))
        :effect (and (holding ?p) (not (parcel ?p ?t)))
    )

    (:action putdown
        :parameters (?p - parcel ?t - tile)
        :precondition (and (at ?t) (delivery ?t) (holding ?p))
        :effect (not (holding ?p))
    )
)
