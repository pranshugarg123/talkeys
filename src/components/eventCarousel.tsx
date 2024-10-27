'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import Image from 'next/image'
import useEmblaCarousel from 'embla-carousel-react'
import image from "../public/images/events.jpg"
interface EventCard {
  date: string
  title: string
  performer: string
  image: any
}

const eventCards: EventCard[] = [
  { date: '21 MAY', title: 'Sunday Salsa', performer: 'DEBORAH DE LUCA', image: {image} },
  { date: '22 MAY', title: 'Monday Blues', performer: 'JOHN DOE', image: {image} },
  { date: '23 MAY', title: 'Tuesday Jazz', performer: 'JANE SMITH', image: {image} },
  { date: '24 MAY', title: 'Wednesday Rock', performer: 'ROCK BAND', image: {image} },
  { date: '24 MAY', title: 'Wednesday Rock', performer: 'ROCK BAND', image: {image} },
  { date: '24 MAY', title: 'Wednesday Rock', performer: 'ROCK BAND', image: {image} },
  { date: '24 MAY', title: 'Wednesday Rock', performer: 'ROCK BAND', image: {image} },
  { date: '24 MAY', title: 'Wednesday Rock', performer: 'ROCK BAND', image: {image} },
  { date: '24 MAY', title: 'Wednesday Rock', performer: 'ROCK BAND', image: {image} },
  { date: '24 MAY', title: 'Wednesday Rock', performer: 'ROCK BAND', image: {image} },
]

export default function EventCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true })
  const [timer, setTimer] = useState(120)

  useEffect(() => {
    if (emblaApi) {
      const intervalId = setInterval(() => {
        emblaApi.scrollNext()
      }, 3000)

      const timerIntervalId = setInterval(() => {
        setTimer((prevTimer) => (prevTimer > 0 ? prevTimer - 1 : 120))
      }, 1000)

      return () => {
        clearInterval(intervalId)
        clearInterval(timerIntervalId)
      }
    }
  }, [emblaApi])

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (emblaApi) {
      if (e.deltaY > 0) {
        emblaApi.scrollNext()
      } else {
        emblaApi.scrollPrev()
      }
    }
  }

  return (
    <div className='mb-[-80px]'>
    <div className='event w-full bg-transparent text-white p-10 overflow-hidden'>
    <div className="w-full bg-transparent text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Upcoming Events</h2>
        {/* <div className="text-xl font-bold text-red-500">{timer.toFixed(2)}</div> */}
      </div>
      <Carousel
        ref={emblaRef}
        className="w-full"
        onWheel={handleWheel}
      >
        <CarouselContent>
          {eventCards.map((card, index) => (
            <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
              <Card className="bg-gray-950 border-none">
                <CardContent className="p-0">
                  <Image
                    src={card.image.image}
                    alt={card.title}
                    width={300}
                    height={400}
                    className="w-full h-64 object-cover"
                  />
                  <div className="p-4">
                    <div>
                    <div className="text-sm text-red-500 mb-2">{card.date}</div>
                    <h3 className="text-xl font-bold mb-2">{card.title}</h3>
                    <h4 className="text-lg mb-4">{card.performer}</h4>
                    </div>
                    <Button variant="outline" className="w-full">More info</Button>
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
    </div>
    </div>
  )
}